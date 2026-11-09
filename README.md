# aBetterMyGCC

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/lnaeejdgpffaicnohajhhkpfkbfekkja)**

An unofficial Chrome extension that gives Grove City College's myGCC portal a cleaner look and puts the things students check most in one place. It is not affiliated with or endorsed by Grove City College.

It works for anyone signed in to myGCC. Everything it shows comes from that person's own myGCC pages, and it stays in Chrome on their computer.

## What it does

- **Home dashboard:** today's classes with times, rooms and professors (or tomorrow's, once today is over), chapel credits, student account balance, unmet degree requirements, and what's being served at Hicks or MAP right now.
- **Course planner (Academics → Add/Drop Courses):**
  - Press **Save** on any search result to add that section to your plan.
  - Each result is tagged **Fits your schedule** or **Conflicts with …**, checked against what you're registered for plus your plan. A checkbox hides the sections that conflict.
  - The plan panel shows a week calendar, the professor, days, times, seats and any overlaps for each section.
  - **Add N courses** looks up each section's reference number and submits them through myGCC's "Add by Reference #" form, six at a time, until all are added.
  - **Load my plan** fills the six boxes and stops, so you can check them and press "Add Course(s)" yourself.
  - **Copy** puts the plan on your clipboard as text. **Download CSV** saves it as a spreadsheet file.
  - Sections you get registered for drop out of the plan automatically.
- **Plan with AI (optional):** paste the courses you need in plain English and an AI model searches myGCC, picks sections that fit your schedule, and adds them to your plan. Bring your own API key from Anthropic (Claude), OpenAI, xAI (Grok) or Google (Gemini). Add it from the extension's toolbar icon. It only builds the plan; you still register.
- **Term dropdowns:** the current term comes first, then upcoming terms, then past terms under a divider, colored by season (spring green, winter blue, fall amber-red, summer gold).
- **Search:** press Ctrl K (⌘ K on a Mac) or / on any myGCC page to jump to any page, course or service.
- **Look:** serif type, GCC crimson, light and dark mode. In dark mode, a contrast pass lightens any dark text or line and darkens any white box that myGCC hard-codes, including text staff paste into pages. Promo banners and decorative boxes are hidden; you can show the banners again from the popup.

## Version 1.1.0

- Redesigned forums and Quick Links, loading feedback, and an update summary.
- Campus announcement and event lists with readable titles.
- Building public and keycard hours with access restrictions; follow building links for official schedules. Breaks and holidays may differ.
- Feedback: write a note, optionally add a screenshot, then Copy and open Telegram (or Copy only / Email instead) and paste it. Nothing is sent automatically.

## Themes

Choose a design in the toolbar popup or Settings > Design themes. Automatic holiday themes are enabled by default and temporarily override the selected design on their scheduled dates; your selected theme returns afterward. Light/Dark/Auto remains separate. Themes ship as folders in `themes/`; there are no imported or personal themes. Autumn pixels includes code-generated SVG artwork and a subtle looping GIF banner with swaying trees and falling leaves, and runs November 15-26. Turn off Animate theme artwork in the popup or Settings to keep it still; OS reduced-motion preferences always use the original static SVG.

Theme sources live in the workspace's `themes/<name>/` folders; run `node themes/build.cjs` to package them into this extension's `themes/` folder. See the workspace `themes/README.md` and `themes/DESIGN.md` for the workflow and token map. `themes/manifest.json` defines installed packs and the default.

Building hours include public/keycard schedules from the campus-hours page, plus 35 facilities in an expandable list. Official source links require GCC sign-in; breaks and athletic events may change access.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `abettermygcc` folder.

After changing any file here, click the reload arrow on the extension's card in `chrome://extensions`, then refresh myGCC.
4. Open https://my.gcc.edu and sign in.

Click the extension's icon to turn the look, the dashboard or the promo banners on or off, and to pick light, dark or automatic.

## Privacy

- Data read from myGCC (schedule, chapel, balance, degree progress, your plan) is stored in `chrome.storage.local` on your computer. It's saved per signed-in person, and the copies read from your pages (schedule, degree progress and GPA, balance, chapel, search index) are removed when myGCC shows its signed-out page. Your saved course plan is kept so it is still there next time.
  - Known limit: a person is recognized by the name myGCC shows in its welcome bar, because no unique ID has been confirmed in myGCC's pages yet. Two people with exactly the same name on one computer would be treated as one person (their saved course plans would be shared). Signing out still clears the cached data.
- The only request to a site other than myGCC is for public dining menus from Nutrislice (`gcc.api.nutrislice.com`), the service the dining halls use for their menus. Nothing about you is sent.
- The Source Serif 4 font loads from Google Fonts.
- Plan with AI and Ask AI are off until you add a key. Both send data only to the AI service you chose, using your key:
  - **Plan with AI** sends your request, your registered/planned course codes and times, and course search results.
  - **Ask AI** (the question box in Ctrl K search) sends your question and text from the myGCC pages it reads to answer it: up to about 6,000 characters per page, plus short excerpts of pages that match its searches. That text can include whatever those pages say about you.
  - Ask AI never opens or sends financial pages (anything under Financial, the account balance, CashNet) or the GPA pages it knows by address (the Degree Progress, grade and transcript portlets). It also never opens files, or links that sign out, delete, drop or register. A page it does not recognize as private is treated like any other page.
- The key is stored in Chrome's extension storage on your computer and is sent only to the AI service it belongs to. Within the extension, only the Settings page (which saves it) and the background worker (which uses it) read it; the scripts that run on myGCC pages never do, though Chrome itself does not block them from that storage.

## Notes

- Chapel attendance is read from the chapel frame on `custom.gcc.edu`, which myGCC itself embeds.
- The account balance sits behind a "Please wait" step in myGCC. If the background fetch doesn't get it, the dashboard picks it up the next time you open My Account Balances.
- Batch add uses only myGCC's own forms. It never touches the Drop checkboxes. Clicking **Add N courses** asks you to confirm before anything is submitted.
