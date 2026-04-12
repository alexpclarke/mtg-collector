declare const Vue: {
  createApp: (...args: any[]) => any;
  ref: <T = any>(value: T) => { value: T };
  computed: <T = any>(getter: () => T) => { readonly value: T };
  watch: (...args: any[]) => void;
  nextTick: (...args: any[]) => Promise<void>;
};

declare const Papa: {
  parse: (...args: any[]) => void;
};
