# Flashcards

Upload CSV files and study the cards. Uploaded files can be removed individually; removing a file also removes its cards and resets study progress. Your cards and review progress are saved in this browser and remain after refresh or returning to the upload screen. Shuffle the remaining cards during review without changing the order of cards already sorted. Mark cards as known or unknown, retry unknown cards, or start over.

During review, click the card or press Space, Up, or Down to flip it. The “Don’t know” pile and button are on the left; “Know” is on the right. Press Left or Right to sort to the corresponding pile.

## CSV format

Each row must contain exactly two fields: the front, then the back. Use CSV quoting for fields containing commas or line breaks. Rows with a different number of fields reject the upload. Additional uploads add cards to the current set.

```csv
Question,Answer
"What is 2 + 2?",4
```

## Run locally

```sh
npm install
npm run dev
```

## Deploy to GitHub Pages

The GitHub Actions workflow builds the site for this repository's Pages path and deploys it whenever changes are pushed to `master`. To enable deployment, open the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source, and save. You can also start a deployment manually from the **Actions** tab.
