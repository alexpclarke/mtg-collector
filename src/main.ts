// Vue application entry point and orchestration layer.
// Owns all reactive state, user event handlers, and the run() pipeline.
// Pure logic lives in domain/ and services/; pure UI utilities live in ui/.
// This file intentionally contains no business logic — it only wires together
// the imported modules and exposes the resulting state/methods to the template.
// @ts-nocheck
import { createApp, ref, computed, watch, nextTick } from "vue";
import Papa from "papaparse";
import "./ui/styles.scss";
import { resetRunOutputRefs, applyRunFailure } from "./ui/run-state.ts";
import { loadScryfallSets, fetchScryfallDataTimestamp, resolveCardsByIdentifier, applyResolutionToInventoryRows, buildScryfallCardUrl } from "./services/scryfall.ts";
import { FOREIGN_BOX_LABEL } from "./domain/constants.ts";
import "./ui/theme.ts";
import { buildSetMappings } from "./domain/sets.ts";
import { languageAbbreviation, formatSetCode, parseRows, packSetsIntoBoxes, isForeignBoxLabel, formatForeignCodes, foreignCardsBySet } from "./domain/parsing.ts";
import { colorForIndex } from "./ui/colors.ts";
import { cardsForBox, boxModalColumns, cardRowKey } from "./ui/layout.ts";
import { openExternalLink, trapModalFocus } from "./ui/dom.ts";
import { useSettings } from "./ui/settings/useSettings.ts";

createApp({
  setup() {
    const file = ref(null);
    const loading = ref(false);
    const error = ref("");
    const isFileDragOver = ref(false);
    const boxes = ref([]);
    const missingEditionList = ref([]);
    const missingEditionTotal = ref(0);
    const totalCards = ref(0);
    const hoveredSegment = ref(null);
    const hoverPosition = ref({ x: 0, y: 0 });
    const selectedBoxIndex = ref(null);
    const selectedSetInfo = ref(null);
    const resolutionSummary = ref("");
    const dataTimestamp = ref("");

    // Fetch the data timestamp eagerly on page load via a HEAD request so it
    // is visible immediately, without waiting for the user to run packing.
    fetchScryfallDataTimestamp().then((raw) => {
      if (raw) {
        const date = new Date(raw);
        dataTimestamp.value = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
          + " " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      }
    });
    const settings = useSettings();
    const { settingRefs, activeSettings, SETTINGS, SETTINGS_BY_ID: s_by_id } = settings;
    const activeFile = ref(null);

    // Returns a cheap identity string for a File object using its stable
    // metadata. Two File objects pointing at the same on-disk file produce the
    // same fingerprint even though they are different JS objects.
    function fileFingerprint(f) {
      return f ? `${f.name}|${f.size}|${f.lastModified}` : null;
    }

    const reviewOpen = ref(false);
    const boxModalEl = ref(null);
    const setModalEl = ref(null);

    // ── Computed ──────────────────────────────────────────────────────────────

    // Total number of packed boxes — displayed in the results summary.
    const boxCount = computed(() => boxes.value.length);
    // True when all preconditions for running are met: a file is selected,
    // the box capacity is valid, and the current file+settings differ from
    // what already produced the displayed output.
    const canRun = computed(() => {
      const capacity = Number(settingRefs["box-capacity"]);
      if (!file.value || !Number.isFinite(capacity) || capacity < s_by_id["box-capacity"].min) return false;
      if (!boxes.value.length) return true;
      const fileChanged = fileFingerprint(file.value) !== fileFingerprint(activeFile.value);
      const settingsChanged = SETTINGS.some((s) => settingRefs[s.id] !== activeSettings.value[s.id]);
      return fileChanged || settingsChanged;
    });

    // ── File input handlers ───────────────────────────────────────────────────

    function onFileChange(event) {
      file.value = event.target.files?.[0] || null;
    }

    function onFileDragOver(event) {
      event.preventDefault();
      isFileDragOver.value = true;
    }

    function onFileDragLeave(event) {
      event.preventDefault();
      isFileDragOver.value = false;
    }

    function onFileDrop(event) {
      event.preventDefault();
      isFileDragOver.value = false;
      file.value = event.dataTransfer?.files?.[0] || null;
    }

    // ── Segment hover handlers ────────────────────────────────────────────────

    // Records the hovered segment and updates the floating set-info tooltip position.
    function onSegmentEnter(boxIndex, segmentIndex, setInfo, event) {
      hoveredSegment.value = { boxIndex, segmentIndex, setInfo };
      if (event?.clientX != null && event?.clientY != null) {
        hoverPosition.value = getTooltipPosition(event.clientX, event.clientY);
        return;
      }
      const rect = event?.currentTarget?.getBoundingClientRect?.();
      if (rect) {
        hoverPosition.value = getTooltipPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    }

    function onSegmentMove(event) {
      if (!hoveredSegment.value) return;
      if (event?.clientX != null && event?.clientY != null) {
        hoverPosition.value = getTooltipPosition(event.clientX, event.clientY);
      }
    }

    function onSegmentLeave(boxIndex, segmentIndex) {
      if (
        hoveredSegment.value &&
        hoveredSegment.value.boxIndex === boxIndex &&
        hoveredSegment.value.segmentIndex === segmentIndex
      ) {
        hoveredSegment.value = null;
      }
    }

    function isHoveredSegment(boxIndex, segmentIndex) {
      return Boolean(
        hoveredSegment.value &&
        hoveredSegment.value.boxIndex === boxIndex &&
        hoveredSegment.value.segmentIndex === segmentIndex
      );
    }

    watch(selectedBoxIndex, async (value) => {
      if (value === null) return;
      await nextTick();
      boxModalEl.value?.focus();
    });

    watch(selectedSetInfo, async (value) => {
      if (!value) return;
      await nextTick();
      setModalEl.value?.focus();
    });

    // ── Run pipeline ──────────────────────────────────────────────────────────

    // Main run function. Orchestrates the full pipeline:
    //   1. Reset output refs
    //   2. Concurrently load Scryfall sets + parse the CSV file
    //   3. Build set mappings from the Scryfall sets data
    //   4. Do a first-pass parse to identify which Scryfall IDs need resolution
    //   5. Resolve Scryfall IDs to edition codes/collector numbers (if enabled)
    //   6. Re-parse with resolved data applied
    //   7. Pack the resolved sets into boxes
    //   8. Write results to reactive refs for the template to render
    async function run() {
      error.value = "";
      resolutionSummary.value = "";
      if (!file.value) {
        error.value = "Choose a CSV file first.";
        return;
      }
      if (!settingRefs["box-capacity"] || settingRefs["box-capacity"] <= 0) {
        error.value = "Box capacity must be a positive number.";
        return;
      }

      resetRunOutputRefs({
        boxes,
        missingEditionList,
        missingEditionTotal,
        totalCards,
        selectedBoxIndex,
        selectedSetInfo,
        hoveredSegment,
      });

      loading.value = true;
      try {
        const [{ sets: scryfallSets }, rows] = await Promise.all([
          loadScryfallSets(),
          new Promise((resolve, reject) => {
            Papa.parse(file.value, {
              header: true,
              skipEmptyLines: true,
              complete: (result) => resolve(result.data),
              error: reject,
            });
          }),
        ]);

        const mappings = buildSetMappings(scryfallSets);
        const firstPass = parseRows(rows, mappings, settingRefs["separate-foreign"], settingRefs["native-language"]);

        let rowsToParse = rows;
        let unresolvedLookupIds = [];

        // Extract all Scryfall IDs from input rows for resolution
        const allScryfallIds = rows
          .map((row) => String(row["Scryfall ID"] || "").trim())
          .filter(Boolean);

        if (settingRefs["resolve-scryfall"] && allScryfallIds.length) {
          const { resolvedByIdentifier, unresolvedIdentifiers } = await resolveCardsByIdentifier(allScryfallIds);
          unresolvedLookupIds = unresolvedIdentifiers;
          if (Object.keys(resolvedByIdentifier).length) {
            rowsToParse = applyResolutionToInventoryRows(rows, resolvedByIdentifier);
          }
        }

        const parsed = parseRows(rowsToParse, mappings, settingRefs["separate-foreign"], settingRefs["native-language"]);
        const packed = packSetsIntoBoxes(parsed.packable, Number(settingRefs["box-capacity"]), {
          firstBoxStartYear: settingRefs["start-at-1993"] ? 1993 : null,
          separateForeignLanguage: settingRefs["separate-foreign"],
          nativeLanguage: settingRefs["native-language"],
          mappings,
        });

        let colorOffset = 0;
        for (const box of packed) {
          box.colorOffset = colorOffset;
          colorOffset += box.sets.length;
        }

        boxes.value = packed;
        selectedBoxIndex.value = null;
        activeFile.value = file.value;
        settings.snapshotSettings();
        missingEditionList.value = parsed.missingEditionList;
        missingEditionTotal.value = parsed.missingEditionTotal;
        totalCards.value = packed.reduce((acc, b) => acc + b.totalCount, 0);

        const firstCount = firstPass.missingEditionTotal;
        const resolvedCount = Math.max(0, firstCount - parsed.missingEditionTotal);
        if (firstCount > 0) {
          const unresolvedPart = unresolvedLookupIds.length
            ? ` ${unresolvedLookupIds.length} Scryfall ID lookups failed.`
            : "";
          resolutionSummary.value = `Resolved ${resolvedCount} review cards by Scryfall ID (${firstCount} -> ${parsed.missingEditionTotal}).${unresolvedPart}`;
        }
      } catch (e) {
        applyRunFailure(
          {
            boxes,
            missingEditionList,
            missingEditionTotal,
            totalCards,
            selectedBoxIndex,
            selectedSetInfo,
            hoveredSegment,
            error,
          },
          e
        );
      } finally {
        loading.value = false;
      }
    }

    return {
      activeFile,
      file,
      loading,
      error,
      isFileDragOver,
      boxes,
      missingEditionList,
      missingEditionTotal,
      resolutionSummary,
      totalCards,
      boxCount,
      canRun,
      onFileChange,
      onFileDragOver,
      onFileDragLeave,
      onFileDrop,
      ...settings,
      onSegmentEnter,
      onSegmentMove,
      onSegmentLeave,
      isHoveredSegment,
      cardsForBox,
      boxModalColumns,
      foreignCardsBySet,
      cardRowKey,
      openExternalLink,
      selectedBoxIndex,
      selectedSetInfo,
      reviewOpen,
      boxModalEl,
      setModalEl,
      hoveredSegment,
      hoverPosition,
      trapModalFocus,
      run,
      colorForIndex,
      formatSetCode,
      isForeignBoxLabel,
      formatForeignCodes,
      languageAbbreviation,
      buildScryfallCardUrl,
      dataTimestamp,
      FOREIGN_BOX_LABEL,
    };
  },
  template: `
    <main class="app-shell cds--content">
      <section class="cds--tile top-box">
        <div class="title-wrap">
          <h1 class="cds--productive-heading-05">MTG Collector</h1>
          <p class="cds--body-long-01">No backend. CSV + Scryfall in the browser.</p>
        </div>

        <div class="controls">
          <div class="cds--file controls-upload">
            <div class="cds--file-container cds--file-container--drop">
              <label
                class="cds--file__drop-container"
                :class="{ 'cds--file__drop-container--drag-over': isFileDragOver }"
                for="csv-upload"
                @dragover="onFileDragOver"
                @dragenter="onFileDragOver"
                @dragleave="onFileDragLeave"
                @drop="onFileDrop"
              >
                <p class="cds--file--label">Drag and drop inventory CSV here or click to upload</p>
                <span class="cds--file-filename">{{ file ? file.name : 'No file selected' }}</span>
              </label>
              <input
                id="csv-upload"
                class="cds--file-input"
                type="file"
                accept=".csv,text/csv"
                @change="onFileChange"
              />
            </div>
          </div>
        </div>

        <ul class="cds--accordion settings-accordion">
          <li class="cds--accordion__item" :class="{ 'cds--accordion__item--active': settingsOpen }">
            <button type="button" class="cds--accordion__heading" :aria-expanded="String(settingsOpen)" @click="settingsOpen = !settingsOpen">
              <svg class="cds--accordion__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3 5.3 3.7 9.6 8l-4.3 4.3.7.7L11 8z" />
              </svg>
              <p class="cds--accordion__title">Advanced settings (optional)</p>
            </button>
            <div class="cds--accordion__wrapper">
              <div class="cds--accordion__content">
                <div class="settings-grid" @click="focusSettingInput($event)">
                  <div
                    v-for="setting in SETTINGS"
                    :key="setting.id"
                    class="cds--layer settings-item"
                    :class="{ 'settings-item--toggle': setting instanceof CheckboxSetting }"
                    @click="setting instanceof CheckboxSetting && toggleSettingCheckbox($event, setting.id)"
                  >
                    <div class="settings-item-head">
                      <label v-if="!(setting instanceof CheckboxSetting)" class="cds--label" :for="setting.id">{{ setting.label }}</label>
                      <span v-else class="cds--label">{{ setting.label }}</span>
                      <span class="settings-info">
                        <span
                          class="cds--tooltip-trigger__wrapper settings-info-trigger"
                          tabindex="0"
                          :aria-label="setting.label + ' setting info'"
                          :aria-describedby="openSettingsTooltip === setting.id ? 'settings-tooltip' : undefined"
                          @mouseenter="showSettingsTooltip(setting.id, $event)"
                          @mouseleave="hideSettingsTooltip(setting.id)"
                          @mousemove="updateSettingsTooltipPosition($event)"
                          @focus="showSettingsTooltip(setting.id, $event)"
                          @blur="hideSettingsTooltip(setting.id)"
                          @keydown.esc.stop.prevent="hideSettingsTooltip(setting.id)"
                        >
                          <svg class="settings-info-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M8 1a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 13a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>
                            <path d="M8.5 11h-1V7h1zm0-6h-1V4h1z"></path>
                          </svg>
                        </span>
                      </span>
                    </div>

                    <template v-if="setting instanceof CheckboxSetting">
                      <div class="cds--checkbox-wrapper settings-input settings-toggle-row">
                        <input :id="setting.id" class="cds--checkbox" type="checkbox"
                          :checked="settingRefs[setting.id]"
                          @change="settingRefs[setting.id] = $event.target.checked"
                        />
                        <label :for="setting.id" class="cds--checkbox-label">Enabled</label>
                      </div>
                    </template>

                    <template v-else-if="setting instanceof IntegerSetting">
                      <div class="cds--number settings-input" data-number>
                        <div class="cds--number__input-wrapper">
                          <input
                            :id="setting.id"
                            class="cds--number__input"
                            type="number"
                            :min="setting.min"
                            :step="setting.step"
                            :value="settingRefs[setting.id]"
                            @input="settingRefs[setting.id] = Number($event.target.value)"
                            @blur="normalizeSettingValue(setting.id)"
                          />
                          <div class="cds--number__controls">
                            <button
                              type="button"
                              class="cds--number__control-btn down-icon"
                              aria-label="Decrease box capacity"
                              @click="adjustBoxCapacity(-1)"
                            >
                              <svg class="down-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                <path d="M4 8h8v1H4z"></path>
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="cds--number__control-btn up-icon"
                              aria-label="Increase box capacity"
                              @click="adjustBoxCapacity(1)"
                            >
                              <svg class="up-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                                <path d="M8 4h1v4h4v1H9v4H8V9H4V8h4z"></path>
                              </svg>
                            </button>
                            <span class="cds--number__rule-divider"></span>
                          </div>
                        </div>
                      </div>
                    </template>

                    <template v-else-if="setting instanceof TextSetting">
                      <div class="cds--text-input-wrapper settings-input">
                        <input
                          :id="setting.id"
                          class="cds--text-input"
                          type="text"
                          :placeholder="setting.placeholder"
                          :value="settingRefs[setting.id]"
                          @input="settingRefs[setting.id] = $event.target.value"
                          @blur="normalizeSettingValue(setting.id)"
                        />
                      </div>
                    </template>

                    <template v-else-if="setting instanceof DropdownSetting">
                      <div class="cds--select settings-input">
                        <div class="cds--select-input__wrapper">
                          <select
                            :id="setting.id"
                            class="cds--select-input"
                            :value="settingRefs[setting.id]"
                            @change="settingRefs[setting.id] = $event.target.value"
                          >
                            <option v-for="opt in setting.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                          </select>
                          <svg class="cds--select__arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M8 11L3 6l.7-.7L8 9.6l4.3-4.3.7.7z"/>
                          </svg>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div class="controls-secondary">
          <button class="cds--btn cds--btn--primary controls-run" @click="run" :disabled="loading || !canRun">
            {{ loading ? 'Processing...' : 'Run Packing' }}
          </button>
        </div>

        <div v-if="error" class="error cds--inline-notification cds--inline-notification--error" role="alert">
          <div class="cds--inline-notification__details">
            <p class="cds--inline-notification__title">Run failed</p>
            <p class="cds--inline-notification__subtitle">{{ error }}</p>
          </div>
        </div>
      </section>

      <section v-if="missingEditionList.length" class="cds--tile section-gap">
        <ul class="cds--accordion cds--accordion--start">
          <li class="cds--accordion__item" :class="{ 'cds--accordion__item--active': reviewOpen }">
            <button type="button" class="cds--accordion__heading" :aria-expanded="String(reviewOpen)" @click="reviewOpen = !reviewOpen">
              <svg class="cds--accordion__arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 3 5.3 3.7 9.6 8l-4.3 4.3.7.7L11 8z" />
              </svg>
              <p class="cds--accordion__title">Needs Review List ({{ missingEditionTotal }})</p>
            </button>
            <div class="cds--accordion__wrapper">
              <div class="cds--accordion__content">
                <p v-if="resolutionSummary" class="cds--body-compact-01 review-resolution-note">{{ resolutionSummary }}</p>
                <table class="missing-table cds--data-table cds--data-table--compact">
                  <thead>
                    <tr>
                      <th>Count</th>
                      <th>Name</th>
                      <th>Edition</th>
                      <th>Language</th>
                      <th>Code</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="m in missingEditionList"
                      :key="m.reason + m.name + m.edition + m.language + m.code"
                      class="missing-row cds--body-compact-01"
                      :class="{ 'missing-row-link': m.scryfallId }"
                      :tabindex="m.scryfallId ? 0 : undefined"
                      @click="m.scryfallId && openExternalLink(buildScryfallCardUrl({ scryfallId: m.scryfallId, setCode: m.code, collectorNumber: m.collectorNumber, language: m.language }))"
                      @keydown.enter.prevent="m.scryfallId && openExternalLink(buildScryfallCardUrl({ scryfallId: m.scryfallId, setCode: m.code, collectorNumber: m.collectorNumber, language: m.language }))"
                      @keydown.space.prevent="m.scryfallId && openExternalLink(buildScryfallCardUrl({ scryfallId: m.scryfallId, setCode: m.code, collectorNumber: m.collectorNumber, language: m.language }))"
                    >
                      <td>{{ m.count }}x</td>
                      <td>{{ m.name }}</td>
                      <td>{{ m.edition || '(blank edition)' }}</td>
                      <td>{{ m.language }}</td>
                      <td>{{ m.code || '-' }}</td>
                      <td>{{ m.reason }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="boxes.length" class="cds--tile section-gap">
        <div class="metrics">
          <div class="cds--tile">
            <div class="metric-title cds--label">Cards in boxes</div>
            <div class="metric-value cds--productive-heading-03">{{ totalCards }}</div>
          </div>
        </div>
      </section>

      <section v-for="(box, i) in boxes" :key="i" class="box-card cds--tile">
        <div class="box-top">
          <div class="box-index cds--heading-compact-01">{{ i + 1 }}</div>
          <button type="button" class="box-label-link cds--link cds--productive-heading-03" @click="selectedBoxIndex = i">{{ box.label }}</button>
          <div class="box-total cds--body-compact-01">{{ box.totalCount }} / {{ activeSettings["box-capacity"] }}</div>
        </div>

        <div class="track">
          <div
            v-for="(s, idx) in box.sets"
            :key="idx + s.code"
            :class="['segment', { 'segment-active': isHoveredSegment(i, idx) }]"
            tabindex="0"
            :style="{ width: Math.max(0.2, (s.count / Math.max(activeSettings['box-capacity'], box.totalCount)) * 100) + '%', background: colorForIndex(box.colorOffset + idx) }"
            @mouseenter="onSegmentEnter(i, idx, s, $event)"
            @mousemove="onSegmentMove($event)"
            @mouseleave="onSegmentLeave(i, idx)"
            @focus="onSegmentEnter(i, idx, s, $event)"
            @blur="onSegmentLeave(i, idx)"
            @click="selectedSetInfo = s"
            @keydown.enter.prevent="selectedSetInfo = s"
            @keydown.space.prevent="selectedSetInfo = s"
          ></div>
        </div>

        <div class="codes cds--code-snippet" v-if="!isForeignBoxLabel(box.label)">
          <template v-for="(s, idx) in box.sets" :key="idx + '-code-' + s.code">
            <button
              type="button"
              class="code-link cds--link"
              :class="{ 'active-code-link': isHoveredSegment(i, idx) }"
              :style="{ '--set-code-color': colorForIndex(box.colorOffset + idx) }"
              @mouseenter="onSegmentEnter(i, idx, s, $event)"
              @mousemove="onSegmentMove($event)"
              @mouseleave="onSegmentLeave(i, idx)"
              @focus="onSegmentEnter(i, idx, s, $event)"
              @blur="onSegmentLeave(i, idx)"
              @click="selectedSetInfo = s"
              @keydown.enter.prevent="selectedSetInfo = s"
              @keydown.space.prevent="selectedSetInfo = s"
            >
              {{ formatSetCode(s.code) }}
            </button><span v-if="idx < box.sets.length - 1">, </span>
          </template>
        </div>
      </section>

      <div class="app-footer-note cds--helper-text-01">
        <span>Powered by GitroHub</span>
        <template v-if="dataTimestamp"><br><span>Data last updated {{ dataTimestamp }}</span></template>
      </div>

      <div
        v-if="openSettingsTooltip"
        id="settings-tooltip"
        class="settings-tooltip segment-tooltip-floating cds--tile cds--layer-three cds--body-compact-01"
        :style="{ left: settingsTooltipPosition.x + 'px', top: settingsTooltipPosition.y + 'px' }"
        role="tooltip"
      >
        {{ activeTooltipText }}
      </div>

      <div
        v-if="hoveredSegment"
        class="segment-tooltip segment-tooltip-floating cds--tile cds--layer-three"
        :style="{ left: hoverPosition.x + 'px', top: hoverPosition.y + 'px', borderLeftColor: colorForIndex(boxes[hoveredSegment.boxIndex].colorOffset + hoveredSegment.segmentIndex) }"
      >
        <p class="cds--productive-heading-01">{{ hoveredSegment.setInfo.name || formatSetCode(hoveredSegment.setInfo.code) }}</p>
        <div
          v-if="hoveredSegment.setInfo.setType === 'foreign-language'"
          class="segment-tooltip-grid cds--body-compact-01"
        >
          <div class="segment-tooltip-label">Language</div>
          <div>{{ hoveredSegment.setInfo.language || 'Unknown' }}</div>
          <div class="segment-tooltip-label">Count</div>
          <div>{{ hoveredSegment.setInfo.count }}</div>
          <div class="segment-tooltip-label">Sets</div>
          <div>{{ (hoveredSegment.setInfo.codes || []).join(', ') || 'Unknown' }}</div>
        </div>
        <div v-else class="segment-tooltip-grid cds--body-compact-01">
          <div class="segment-tooltip-label">Code</div>
          <div>{{ formatSetCode(hoveredSegment.setInfo.code) }}</div>
          <div class="segment-tooltip-label">Count</div>
          <div>{{ hoveredSegment.setInfo.count }}</div>
          <div class="segment-tooltip-label">Release Date</div>
          <div>{{ hoveredSegment.setInfo.releasedAt || 'Unknown' }}</div>
          <div class="segment-tooltip-label">Set Type</div>
          <div>{{ hoveredSegment.setInfo.setType || 'Unknown' }}</div>
        </div>
      </div>

      <div
        v-if="selectedBoxIndex !== null"
        ref="boxModalEl"
        class="cds--modal is-visible"
        role="dialog"
        aria-modal="true"
        aria-labelledby="box-modal-heading"
        tabindex="-1"
        @click.self="selectedBoxIndex = null"
        @keydown.esc="selectedBoxIndex = null"
        @keydown.tab="trapModalFocus"
      >
        <div class="cds--modal-container cds--modal-container--lg">
          <div class="cds--modal-header">
            <h2 id="box-modal-heading" class="cds--modal-header__heading">Box {{ selectedBoxIndex + 1 }}: {{ boxes[selectedBoxIndex]?.label }}</h2>
            <button type="button" class="cds--modal-close-button cds--modal-close" aria-label="Close modal" @click="selectedBoxIndex = null">
              <svg class="cds--modal-close__icon" focusable="false" preserveAspectRatio="xMidYMid meet" width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M24 9.4 22.6 8 16 14.6 9.4 8 8 9.4 14.6 16 8 22.6 9.4 24 16 17.4 22.6 24 24 22.6 17.4 16 24 9.4z" />
              </svg>
            </button>
          </div>
          <div class="cds--modal-content app-modal-content box-modal-content">
            <div class="set-columns">
              <div
                v-for="(column, columnIndex) in boxModalColumns(boxes[selectedBoxIndex])"
                :key="'box-column-' + columnIndex"
                class="set-column"
              >
                <div
                  v-for="setGroup in column"
                  :key="setGroup.setInfo.code"
                  class="set-group"
                >
                  <button
                    type="button"
                    class="set-header set-header-link cds--link cds--productive-heading-02"
                    @click="selectedSetInfo = setGroup.setInfo"
                  >
                    {{ setGroup.setInfo.name }} ({{ formatSetCode(setGroup.setInfo.code) }})
                  </button>
                  <div class="card-list">
                    <div
                      class="cds--tile card-row cds--body-compact-01"
                      v-for="card in setGroup.cards"
                      :key="cardRowKey(card)"
                      :class="{ 'card-row-link': card.scryfallId }"
                      :tabindex="card.scryfallId ? 0 : undefined"
                      @click="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                      @keydown.enter.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                      @keydown.space.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                    >
                      <span class="card-count">{{ card.count }}x</span>
                      <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                      <component :is="card.scryfallId ? 'a' : 'span'" class="card-name" :class="{ 'card-link': card.scryfallId }" :href="card.scryfallId ? buildScryfallCardUrl(card) : undefined" target="_blank" rel="noopener noreferrer" @click.stop>{{ card.name }}<span v-if="!activeSettings['separate-foreign'] && card.language && card.language !== 'English'" class="card-language-tag"> {{ languageAbbreviation(card.language) }}</span><span v-if="card.foil" class="foil-indicator">★</span></component>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="selectedSetInfo !== null"
        ref="setModalEl"
        class="cds--modal is-visible"
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-modal-heading"
        tabindex="-1"
        @click.self="selectedSetInfo = null"
        @keydown.esc="selectedSetInfo = null"
        @keydown.tab="trapModalFocus"
      >
        <div class="cds--modal-container cds--modal-container--lg">
          <div class="cds--modal-header">
            <h2 id="set-modal-heading" class="cds--modal-header__heading">{{ selectedSetInfo.name }} ({{ formatSetCode(selectedSetInfo.code) }})</h2>
            <button type="button" class="cds--modal-close-button cds--modal-close" aria-label="Close modal" @click="selectedSetInfo = null">
              <svg class="cds--modal-close__icon" focusable="false" preserveAspectRatio="xMidYMid meet" width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M24 9.4 22.6 8 16 14.6 9.4 8 8 9.4 14.6 16 8 22.6 9.4 24 16 17.4 22.6 24 24 22.6 17.4 16 24 9.4z" />
              </svg>
            </button>
          </div>
          <div class="cds--modal-content app-modal-content set-modal-content">
            <template v-if="selectedSetInfo.setType === 'foreign-language'">
              <div
                v-for="setGroup in foreignCardsBySet(selectedSetInfo)"
                :key="setGroup.code + setGroup.name"
                class="set-group"
              >
                <div class="set-header cds--productive-heading-02">{{ setGroup.name }} ({{ setGroup.code }})</div>
                <div class="card-list">
                  <div
                    class="cds--tile card-row cds--body-compact-01"
                    v-for="card in setGroup.cards"
                    :key="cardRowKey(card)"
                    :class="{ 'card-row-link': card.scryfallId }"
                    :tabindex="card.scryfallId ? 0 : undefined"
                    @click="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                    @keydown.enter.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                    @keydown.space.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                  >
                    <span class="card-count">{{ card.count }}x</span>
                    <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                    <component :is="card.scryfallId ? 'a' : 'span'" class="card-name" :class="{ 'card-link': card.scryfallId }" :href="card.scryfallId ? buildScryfallCardUrl(card) : undefined" target="_blank" rel="noopener noreferrer" @click.stop>{{ card.name }}<span v-if="!activeSettings['separate-foreign'] && card.language && card.language !== 'English'" class="card-language-tag"> {{ languageAbbreviation(card.language) }}</span><span v-if="card.foil" class="foil-indicator">★</span></component>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="card-list">
              <div
                class="cds--tile card-row cds--body-compact-01"
                v-for="card in (selectedSetInfo.cards || [])"
                :key="cardRowKey(card)"
                :class="{ 'card-row-link': card.scryfallId }"
                :tabindex="card.scryfallId ? 0 : undefined"
                @click="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                @keydown.enter.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
                @keydown.space.prevent="card.scryfallId && openExternalLink(buildScryfallCardUrl(card))"
              >
                <span class="card-count">{{ card.count }}x</span>
                <span class="card-number" v-if="card.collectorNumber">{{ card.collectorNumber }}</span>
                <component :is="card.scryfallId ? 'a' : 'span'" class="card-name" :class="{ 'card-link': card.scryfallId }" :href="card.scryfallId ? buildScryfallCardUrl(card) : undefined" target="_blank" rel="noopener noreferrer" @click.stop>{{ card.name }}<span v-if="!activeSettings['separate-foreign'] && card.language && card.language !== 'English'" class="card-language-tag"> {{ languageAbbreviation(card.language) }}</span><span v-if="card.foil" class="foil-indicator">★</span></component>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
}).mount("#app");
