# Chameleon
AI Gmail Rewriter (Chrome Extension)
Rewrite your Gmail drafts with AI. Select text in a compose window, click Rewrite in Chameleon, tweak tone/goals, and one-click Replace in Gmail or Copy.

# -- Quick Start -- #
1. Clone and Install
git clone <your-fork-url> chameleon
cd chameleon
npm install

2. Create your .env - TWO OPTIONS
Get .env key from OPENAI (https://platform.openai.com/) and create new secret key, copy and paste the generated key (starts with sk-...).
1) Create a file named .env in the project root:
# REQUIRED — you can also paste the key inside the extension Settings later
VITE_OPENAI_API_KEY=sk-...yourkey...

# OPTIONAL
# Examples: gpt-4o-mini, gpt-4o, o3-mini
VITE_OPENAI_MODEL=gpt-4o-mini

2) Settings Page of Extension (recommended for non-developers)
Open extension → gear icon → save API key and Model

3. Build
npm run build
This outputs the extension bundle to dist/.

4. Load in Chrome
- Open chrome://extensions
- Turn on Developer mode (top right)
- Click Load unpacked and select the project’s dist/ folder

5. Set up the key
- Click the extension icon → Settings (top right icon)
- Paste your OpenAI API Key and pick a Model (e.g., gpt-4o-mini)
- Click Save and Test


# -- How to Use -- #
1. Open Gmail and start composing an email.

2. Select the text you want to rewrite. A small button appears near the selection: "Rewrite in Chameleon"

3. Click the chip → the popup opens with your selected text already loaded into Text to rewrite.

4. Choose a tone (Auto/Casual/Formal/Friendly/Assertive or your own) and goal (Auto/Follow-up/Apply for job/Ask for help/ or your own), or add Extra Instructions.

5. Click Rewrite.

6. Use Copy to Clipboard to copy the result.

7. Use Replace in Gmail to insert it back exactly where you selected it (or at the caret).

8. Compare Tones tab: generate multiple tone variants; click Use this on any card to move it back into Text to rewrite for further editing.

Tip: The popup also remembers the last selected text so you can reopen Chameleon and continue.