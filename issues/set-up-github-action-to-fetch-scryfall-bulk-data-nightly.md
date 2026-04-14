# Issue Title
Set up GitHub Action to fetch Scryfall bulk data nightly

# Description
We need to create a GitHub Action that fetches the Scryfall bulk data nightly and updates the repository with the latest data. Key steps and considerations:
- Schedule a GitHub Actions workflow to run every night at midnight UTC.
- Fetch Scryfall bulk data from https://api.scryfall.com/bulk-data.
- Store or update the data in the repository as a JSON file.
- Commit the changes automatically to the repository using the workflow.
- Ensure the workflow includes a way to skip CI for these automated commits.
- Check Scryfall’s API rate limits and follow any policies. This will help reduce API calls during runtime and keep the data up-to-date.