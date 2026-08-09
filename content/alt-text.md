# Alt text for the home page images

15 of the 17 images on the home page have no alt text or an empty one. Alt text
is what a screen reader announces, what Google indexes, and what appears if an
image fails to load on a slow connection.

**Where to put it:** WordPress admin → Media → click the image → *Alternative
Text* field. Setting it there fixes the image everywhere it is used at once. For
images placed by a page builder row, check the row's own image settings too.

**The rule for each image below:**

- *Informative* — describe what a sighted person gets from it, in a sentence.
- *Decorative* — the image adds nothing the surrounding text does not already
  say. Give it an **empty** alt (`alt=""`, not a missing attribute) so screen
  readers skip it instead of reading a filename aloud.
- Do not begin with "Image of" or "Photo of" — screen readers already announce
  that it is an image.

---

## Photographs

| File | Type | Alt text to use |
|---|---|---|
| `ncborgnz-logo.png` | informative | `Northcote Baptist Church` *(already correct — leave as is)* |
| `ncborgnz-retinalogo.png` | informative | `Northcote Baptist Church` *(already correct)* |
| `Church-85.jpg` | informative | `A pastor preaching from the platform on a Sunday morning, with the wooden cross and band behind him.` |
| `Church-17.jpg` | informative | `The congregation standing and singing together during a Sunday service.` |
| `Screen-Shot-2020-06-08-at-8.04.19-AM.png` | informative | `Three people sitting together at a table going through paperwork and a laptop — free, confidential budgeting support.` |
| `care.jpg` | informative | *Could not retrieve this file to describe it — check what it shows and write one sentence.* |

---

## Posters with text baked into them

These need **two** fixes, and alt text alone is not enough.

The dates, times, prices and phone numbers in these images are invisible to
Google, to screen readers, to anyone who copies and pastes, and to any
translation plugin. Someone looking for "prayer meeting Northcote" will never
find the prayer poster.

**Fix:** keep the poster as the visual, give it a short alt, and put the actual
details in real text underneath it. That text is what people and search engines
will actually use.

| File | Alt text | Details that must also appear as real text |
|---|---|---|
| `NBC_vision-mission-values.jpg` | `""` (decorative once the text below it is real) | Vision, Mission and the four Values — **already done** in `pages/vision-mission-values.html` |
| `NBC_vision.jpg` | `""` (decorative) | Same vision statement — covered by the same file |
| `NBC_values.jpg` | `""` (decorative) | The four values — covered by the same file |
| `NBC-Strategic-Principles.jpg` | `""` (decorative) | Six strategic principles — **already done** in `pages/strategic-principles.html` |
| `Creed.jpg` | `""` (decorative) | CREED wheel — **already done** in `pages/creed.html` |
| `Ecc.jpg` | `Ecclesiastes` | The current teaching series title, plus its dates and the passages covered |
| `Mission-Hotline-Aug-9th-2026.png` | `Mission Hotline` | **When:** Sunday 9 August, following the worship service · **Where:** NBC Mezzanine Area · **Guest speaker:** Kevin Honore, sharing about his work with Bright Hope World |
| `Discovering-Prayer-Screen1.jpg` | `Discovering Prayer` | A four-week course, 3–24 August, Mondays 7:15–9:00pm |
| `prayer.png` | `Let's pray together` | Thursday 13 August, 10:00am · Monday 31 August, 7:00pm · Both gatherings in the Church Lounge |
| `coffee.jpg` | `Our Coffee Cart` | Open 9:30–9:55am and again after the service each Sunday · Coffee and hot chocolate $3 · Prepaid card, 12 coffees for $33 |
| `cap.jpg` | `Christians Against Poverty` | Free and confidential budgeting and debt counselling. Call **0508 227 111**. |

---

## Why the phone number matters most

`cap.jpg` carries `0508 227 111` — a free debt-help line — and it exists only as
pixels. Someone in financial distress on a phone cannot tap it, cannot copy it,
and cannot find it by searching. Putting that number in real text, marked up as
`<a href="tel:0508227111">0508 227 111</a>`, is a five-minute change with a
disproportionate benefit.

---

## Two habits that stop this recurring

1. **Never put a date, time, price or phone number only in an image.** The poster
   is fine; the poster *plus* three lines of text underneath is what works.
2. **Fill in the alt field when uploading**, not later. It takes ten seconds at
   upload time and is a chore for someone else afterwards.
