# R-calorie-tracking: free food data, photo recognition and targets for a MettleUp calorie tracker

Researched 24 Oct 2026 (every "checked" date below is this date unless stated).
Written for the owner: plain English first, sources after each claim.
**Not legal advice.** Where a licence is unclear I say so and name who to ask.

Marks used: **VERIFIED** = I read the primary page myself on 24 Oct 2026.
**SECONDARY** = only a blog / aggregator said it. **UNVERIFIED** = could not confirm.

---

## 0. The short version

| Question | Answer |
|---|---|
| What exists in the app today? | A hidden screen where the member types a description and four numbers by hand. **No food database at all.** The AI coach guesses the numbers. |
| Best food data for Indian dishes | **IFCT 2017** (government tables, 528 raw foods) is the best data, but its book says it **cannot be put into a product without NIN's written permission**. **INDB 2024** (1,014 Indian recipes, 1,095 foods) is the best ready-made recipe list, but its **GitHub page has no licence** and it is built from IFCT. Both need a written yes before we ship them. |
| Free data we can use today without asking | **USDA FoodData Central** (CC0, public domain) for raw ingredients and **Open Food Facts** (ODbL, about 25,000 Indian packaged products) for barcodes. Indian home dishes we build ourselves from ingredients (that is how INDB was made). |
| Best photo option | A small hosted vision model used only to **name the dishes and count the katoris**; the app then looks up calories in its own table and the member confirms. Never let the AI invent the calorie number. |
| Cost per 1,000 photo logs | **About Rs 30 to Rs 150** on a paid, no-training API (Claude Haiku 5.5 or Gemini Flash-Lite). Roughly Rs 3 to Rs 14 per member per month at 3 photos a day. Cloudflare's free 10,000 units a day covers only about 195 photos a day for everyone together. |
| Top risks | (1) data licence unclear, (2) photo numbers are often 20 to 40 percent off and usually low, (3) photos are personal data and the app promises food never leaves the phone. |

Exchange rate used: **Rs 96 per US dollar** (a currency page showed 96.5 with no visible timestamp, 52-week range 86.25 to 96.96; treat as approximate).
Source: https://pluang.com/en/tools/currency-converter/usd-inr (SECONDARY, checked 24 Oct 2026).

---

## 1. What the app already has (read from the code, 24 Oct 2026)

All paths are under `apps/mobile/` in this repo.

| Piece | What it does today |
|---|---|
| Switch | `src/lib/features.ts` has `nutrition: false`. The screen redirects to Home. The tracker row "Food and calorie log" says on hold since 22 Oct. |
| Screen | `src/app/nutrition.tsx`: shows today's totals against targets, and an "Add a meal" form. The member **types a description plus calories, protein, carbs and fat by hand**. Calories are required; the rest default to 0. Delete is supported. No search, no portions, no food list, no photo button. |
| Storage | `src/db/schema.ts`, table `meals`: id, date, time, description, calories, protein_g, carbs_g, fat_g, `source` ('text', 'photo' or 'seed') and `photo_uri`. All on the phone (SQLite). The column for photos already exists but nothing fills it from this screen. |
| Food data source | **None.** There is no food table. The 13 weeks of demo meals in `src/db/seed/meals.ts` are hand-typed estimates (for example "Paneer bhurji + 2 roti, 560 kcal, 26 P, 50 C, 26 F"), not from IFCT or any database. |
| AI coach | `src/ai/tools.ts` has a `log_meal` tool whose own description says the model must estimate calories and macros itself "from the description or photo". Photos only work if the member pastes **their own Claude or OpenAI key** in Settings (`src/ai/orchestrator.ts`; Groq cannot see images; the offline coach cannot read photos). So photo logging is effectively not available to normal members. |
| Targets | `src/onboarding/form.ts` `computeTargets`: calories = body weight x 33 x goal factor (muscle 1.10, strength 1.05, general 1.00, fat loss 0.85), rounded to 50. Protein = 1.5 to 2.0 g per kg by goal. Fat = 25 percent of calories. Carbs = the rest. It ignores age, height and sex. Reference weight 75 kg if skipped. |
| Privacy promise | The tracker says body weight, photos, notes and food never leave the phone (`docs/OWNER-INBOX.md`). Sending meal photos to any server changes that promise. |

---

## 2. Food composition data (what the numbers per 100 g come from)

### 2.1 Candidates

| Source | What it is | Licence / terms (checked) | Machine-readable? | India fit |
|---|---|---|---|---|
| **IFCT 2017** (ICMR-NIN) | 528 raw Indian foods, measured in labs. The official book is a 585-page PDF. | **VERIFIED.** The book's own notice says the data can be reproduced "for personal use with full acknowledgment", but "no part of this publication can be stored or reproduced in any electronic format for creating a product without the prior written permission of the National Institute of Nutrition, Hyderabad". No licence is stated. NIN gives contact emails in the book: ifct2017@gmail.com and nin@ap.nic.in. Source: https://nin.res.in/ebooks/IFCT2017.pdf (page 3 of the PDF), 24 Oct 2026. | PDF only from NIN. A third-party npm package `ifct2017` exists (latest 2.1.2, modified 9 Sep 2026). | Best raw data for Indian staples (dal, atta, millets, vegetables). Raw only; cooked dishes not covered. |
| **`ifct2017` npm package** | Someone's JSON copy of the IFCT book | **VERIFIED.** Package licence is now AGPL-3.0-or-later (registry shows it; the project README says "As of 1 May 2025 ... AGPL-3.0. Previous versions remain under MIT"). That licence covers the **code**. It does **not** give us NIN's permission for the **data**. No statement of NIN permission found. Sources: https://registry.npmjs.org/ifct2017 , https://github.com/ifct2017/ifct2017.github.io | Yes (JSON) | Same as IFCT. **Do not ship from this**; AGPL on the code is also a trap for a closed-source app. |
| **INDB** (Indian Nutrient Databank, 2024) | 1,095 raw foods + **1,014 Indian recipes**, nutrients per 100 g **and per serving**, serving size and total weight per recipe. Raw foods mostly from IFCT 2017, gaps from IFCT 2004, UK CoFID and USDA. | **VERIFIED partly.** The paper is open access, CC BY 4.0 (Current Developments in Nutrition, 13 Jun 2024). The GitHub repo (lindsayjaacks/Indian-Nutrient-Databank-INDB-) has **no licence file** (GitHub reports licence: none; last push 8 Apr 2025). The README says the IFCT tables themselves are *not* included and "must be requested from the original sources". The paper says nothing about NIN permission. Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795 , https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- , https://api.github.com/repos/lindsayjaacks/Indian-Nutrient-Databank-INDB- | Yes: `INDB.xlsx` (about 1 MB) | Closest thing to "roti, dal, sabzi, biryani with a serving size". Authors list limits: cooking weight change not corrected, USDA retention factors on only 42.6 percent of ingredients, thin regional coverage, no packaged foods. |
| **USDA FoodData Central** | US government food data. Foundation Foods (Apr 2026), SR Legacy (final, Apr 2018), FNDDS survey foods (Oct 2024), Branded (Apr 2026). | **VERIFIED.** CC0 1.0 / public domain; asks for credit. API: free key from data.gov, **1,000 requests per hour per IP** by default. Foundation Foods CSV download is tiny (3.7 MB zipped); SR Legacy CSV 6.7 MB zipped. Sources: https://fdc.nal.usda.gov/about-us/ , https://fdc.nal.usda.gov/api-guide , https://fdc.nal.usda.gov/download-datasets/ | Yes (CSV, JSON) | Good for raw ingredients (rice, chicken, eggs, whey, oil, oats). No Indian dishes or katori portions. |
| **Open Food Facts** | Crowd-sourced barcodes and labels. | **VERIFIED.** Database: ODbL; individual entries: Database Contents Licence; **photos: CC BY-SA**. ODbL means: credit them, and if we publish a database made from theirs, it must also be open (share-alike). Source: https://world.openfoodfacts.org/data . **India count:** 24,993 products tagged India when I queried their API on 24 Oct 2026 (https://world.openfoodfacts.org/api/v2/search?countries_tags_en=india&page_size=1). The India sub-site `in.openfoodfacts.org` returned "temporarily unavailable" that day. | Yes (API, nightly CSV about 0.9 GB zipped, JSONL, Parquet) | Good for protein powders, biscuits, packaged snacks. Useless for home cooking. Quality varies (crowd-sourced). |
| **UK CoFID 2021** | UK government dataset, 2,887 foods | **VERIFIED via search.** Open Government Licence, credit required. Sources: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid , https://fnnbri.quadram.ac.uk/?p=34 . Whether it has Indian dishes: UNVERIFIED (I found none). | Yes (Excel) | Low. |
| **FatSecret Platform API** | Commercial food API with a free tier | **VERIFIED.** Basic: free, 5,000 calls a day, attribution required, **US-only datasets**. Premier Free: for startups under US$1M revenue and funding, non-profits, students; non-US access "at a discount". Premier (62+ countries): price "upon request". India is not mentioned. Image recognition is a paid add-on. Source: https://platform.fatsecret.com/api-editions | API | India coverage UNVERIFIED. Needs a live connection, so it breaks the offline promise. |
| Edamam, Nutritionix | Commercial food APIs | UNVERIFIED. Searches found no current price or India coverage. Nutritionix does not publish a price (contact sales). | API | Skip. |
| Indian packaged-food dataset (Mendeley, 2026) | Academic dataset of packaged foods | Appeared in search; licence not read. UNVERIFIED. https://data.mendeley.com/datasets/rhswn9z9xr/1 | ? | Packaged only. |

### 2.2 Household measures (katori, roti)

* ICMR-NIN's "Dietary Guidelines for Indians 2024" is the official source for standard katori sizes and cooked-food weights. I **could not open the PDF** (the download came back truncated and the page address returned 404 for the fetch tool), so I could not confirm any figure from the primary document. One shop blog that quotes it lists katoris of 360, 200, 155 and 115 ml with weights taken on a kitchen scale; I do **not** trust those numbers yet. (SECONDARY: https://instacuppastore.com/blogs/main-page/ladle-size-guide-how-much-dal-one-karchhi-pours-and-why-yours-dribbles ; official PDF address: https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf.)
* The guideline reportedly admits home katoris vary a lot, which is exactly why the app should let the member pick a katori size once ("my katori") and store grams per katori per food. (SECONDARY, same blog.)
* INDB already stores a serving size and total weight for each recipe (VERIFIED, PMC11277795), so it is the best available seed for "1 serving of rajma = X g".
* Action: read the DGI 2024 annexure by hand once and write our own table (roti 30/40/50 g, 1 katori cooked rice, dal, sabzi, 1 egg, 1 scoop whey). Facts like "a medium roti weighs about 40 g" are not creative work, but I could not verify any specific number here.

### 2.3 What I recommend for the data (legal path)

1. **Starter table, built by us (ships in the app, offline, about 500 foods).** Raw ingredients from USDA (CC0). Indian dishes computed from ingredient recipes, the same method INDB used. Cooked-rice/roti/dal values cross-checked against IFCT book values *by hand for our own checking* (not copied into the app) until NIN replies.
2. **Email NIN now** (ifct2017@gmail.com, nin@ap.nic.in) asking for written permission to include IFCT values in a commercial fitness app, with credit. Free to ask. If they say yes, the IFCT numbers go straight in. This is the single most valuable action.
3. **Email the INDB authors** (the GitHub account is lindsayjaacks; Jaacks is the last-named author of the paper) asking them to add a licence file and confirm that reuse of the recipes is allowed. Until then, do not copy INDB rows.
4. **Open Food Facts** looked up live by barcode for packaged items (protein powder, bars). Credit them. Keep their data out of our own redistributed table.
5. Ask a lawyer one question before launch: "are nutrient values from a government table copyrightable in India and does the NIN notice bind us?" I did not research Indian case law and make no claim.

---

## 3. Photo recognition

### 3.1 Open image datasets (for training our own model, not needed at first)

| Dataset | Size | Licence / terms (checked) | Use in a commercial app? |
|---|---|---|---|
| **Food-101** | 101,000 images, 101 dishes (mostly Western) | The ETH page states **no licence** (VERIFIED, https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/). The dataset's own licence text, quoted by TensorFlow's catalogue, says the images come from Foodspotting and use beyond "scientific fair use" must be negotiated with the picture owners (SECONDARY, https://tensorflow.google.cn/datasets/community_catalog/huggingface/food101). Other sites label it CC BY or CC BY-SA, which conflict. | **No, treat as research only.** |
| **UECFOOD-256** | 256 Japanese-leaning dishes | I found nothing on its licence. UNVERIFIED. | Assume no. |
| **Khana** (Indian, 2025 paper) | about 131,000 images, **80 Indian dish classes**, scraped from search engines and Swiggy/Zomato; best baseline ConvNeXt-S 86.7 percent top-1 | Paper shows CC BY-NC-ND on the *paper page*; no dataset licence stated; scraping with no copyright discussion; no download link in the paper (project page khana.omkar.xyz). Source: https://arxiv.org/html/2509.06006v1 (VERIFIED). | **No** until the authors grant a licence. Useful only as a list of which dishes matter. |
| Other Indian sets (Kaggle "Indian food classification", Hugging Face `rajistics/indian_food_images` 20 classes, "Food Wise AI" 21 classes) | small | Licence field empty or not found. UNVERIFIED. https://huggingface.co/datasets/rajistics/indian_food_images | No. |
| **Nutrition5k** (Google, 2021) | 5,006 plates with true calories, mass and macros per dish and per ingredient, depth images | **VERIFIED: CC BY 4.0, commercial use allowed**, credit the CVPR 2021 paper. 181 GB download. Repo archived 19 Apr 2026. US cafeteria food only. Source: https://github.com/google-research-datasets/Nutrition5k | **Yes legally**, but US food, so little help for Indian plates. Useful for learning how well "photo to calories" can work. |

Summary: **there is no clean, commercially licensed Indian food photo dataset that I could find.** That is why training our own model is a later job, and why a general vision model is the practical route.

### 3.2 Models we could run ourselves

| Option | Facts (checked) | Verdict |
|---|---|---|
| **Cloudflare Workers AI** (owner's account) | **VERIFIED:** 10,000 neurons a day free (resets 00:00 UTC), beyond that $0.011 per 1,000 neurons on the Paid plan (about Rs 1.06 per 1,000 neurons). Customer content is **not used to train models** (https://developers.cloudflare.com/workers-ai/platform/data-usage/). Vision-capable models in the catalogue today: `llama-3.2-11b-vision-instruct`, `llama-4-scout-17b-16e`, `mistral-small-3.1-24b`, `llava-1.5-7b-hf`, `moondream3.1-9B-A2B`, plus newer ones (`kimi-k2.6`, `qwen3.8-27b`, `glm-5.3-flash`, `deepseek-v4.1-flash`, `clef` family). Sources: https://developers.cloudflare.com/workers-ai/platform/pricing/ , https://developers.cloudflare.com/workers-ai/models/ . Prices per million tokens: Llama 3.2 11B vision $0.049 in / $0.676 out (4,410 / 61,493 neurons); Llama 4 Scout $0.27 / $0.85; Gemma 3 12B $0.345 / $0.556; Mistral Small 3.1 $0.351 / $0.555. **How an image is charged is not on the current page.** An older docs revision said an image costs 1,601 to 6,404 tokens, "most images" 6,404 (SECONDARY, a deleted line in https://patch-diff.githubusercontent.com/raw/cloudflare/cloudflare-docs/pull/20118.patch; may be out of date). Llama 3.2 vision needs a one-time "agree" to Meta's licence on the account; Meta restricts multimodal Llama only for companies and people **based in the EU**, India is fine (https://www.llama.com/faq/). | Good for **prototyping at zero cost**. Rough maths: one photo with the old 6,404-token image charge plus about 350 output tokens is about 51 neurons, so the free quota is about **195 photos a day across all members**. After that about Rs 5 per 100 photos (see 3.4). How well an 11B model names Indian dishes: **unknown, must be tested**. |
| On-device model (TFLite) | Search found no ready, commercially licensed Indian-food TFLite model. A Hugging Face Indian-food classifier tagged Apache-2.0 (20 classes, a heavy ViT) and a GitHub EfficientNet-b2 project (MIT, 12 dishes, scraped images) exist; trained on scraped photos, so the image rights are doubtful. Sources: https://huggingface.co/Prahaladha/Indian_Food_Classification , https://github.com/deeprodge/Indian-Dishes-Classifier (SECONDARY). | Not now. Only 12 to 20 dishes; and the model licence does not cover the training photos. |

### 3.3 Hosted vision APIs: price per photo and training policy

Per-photo cost assumes one phone photo shrunk to about 1,000 x 1,000 px, a 300-token instruction, and about 350 tokens of JSON back. "Thinking" tokens can add 2x to 3x to the output side, so I give a range. Rs 96 per dollar.

| API | Token price per 1M (in / out), checked 24 Oct 2026 | Approx. cost per 1,000 photos | Trains on API data? |
|---|---|---|---|
| **Claude Haiku 5.5** (`claude-haiku-5-5`) | $0.10 / $0.50 (prompts up to 100k). A 1000x1000 image = 1,296 tokens. Sources: https://platform.claude.com/docs/en/about-claude/pricing , https://platform.claude.com/docs/en/build-with-claude/vision | **about Rs 32** (Rs 90 with heavy thinking) | **No by default** for commercial products (https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training). Images are not stored after processing (vision FAQ). |
| Claude Sonnet 5.5 | $2 / $10 | about Rs 600 | Same. Only if Haiku is not good enough. |
| **Gemini 3.1 Flash-Lite** (paid tier) | $0.25 / $1.50. Image cost per photo not stated on the pricing page; the vision page says 258 tokens per 768 px tile, so about 1,000 tokens is a fair guess. Source: https://ai.google.dev/gemini-api/docs/pricing , https://ai.google.dev/gemini-api/docs/image-understanding | about **Rs 85** (up to Rs 150 with thinking) | **Free tier: YES, Google uses it to improve products and humans may read it. Paid tier: No.** Free-tier terms also say "do not submit sensitive, confidential, or personal information". Source: https://ai.google.dev/gemini-api/terms |
| Gemini 3.8 Flash | $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 | about Rs 230 now, Rs 460 from Jan 2027 | Same as above |
| **OpenAI gpt-5-nano / gpt-4o-mini** | $0.05 / $0.40 and $0.15 / $0.60. Image token count not on the pricing page (UNVERIFIED), so the figure below is a guess. Source: https://developers.openai.com/api/docs/pricing | about Rs 20 to Rs 60 (guess) | OpenAI says API data is not used for training unless you opt in; I only found this through a third-party tracker (SECONDARY: https://conductatlas.com/platform/openai/openai-api-data-usage-policies/api-and-enterprise-data-not-used-for-model-training/). Read OpenAI's own page before relying on it. |
| **Cloudflare Llama 3.2 11B vision** | See 3.2 | free to about 195 photos/day, then about Rs 54 | **No** (Cloudflare statement above) |
| **LogMeal** (food-specific API) | Credit-based; food recognition with portion estimate uses 1 credit per image; **price per credit not on the page**; trial 200 queries; standard plans capped at 20 images per day per end user. Indian cuisine support not mentioned. Source: https://logmeal.com/api/pricing | UNVERIFIED (cannot state rupees) | Not stated on the page |
| **Passio** | Price "not listed", cloud-based, Indian foods not mentioned. Source: https://www.passio.ai/nutrition-ai | UNVERIFIED | Not stated |
| **Calorie Mama** | Could not find a current page or price. | UNVERIFIED | UNVERIFIED |
| FatSecret image recognition | Paid add-on in 25,000-input tiers; price on request. Source: https://platform.fatsecret.com/api-editions | UNVERIFIED | UNVERIFIED |

**Owner rule check:** Gemini on the free tier and the Gemini app are out (they train on the data and may be read by humans). Only paid-tier, no-training endpoints are allowed. Also: Gemini's terms say API clients may not be aimed at, or likely used by, people under 18, and may not give medical advice. A gym app can have teenagers, so prefer Claude or Cloudflare for photos, or block under-18s from photo logging.

### 3.4 Cost per 1,000 photos, worked out

| Step | Haiku 5.5 | Gemini 3.1 Flash-Lite | Cloudflare Llama 3.2 11B |
|---|---|---|---|
| Input tokens (image + instructions) | 1,296 + 300 = 1,600 | about 1,000 + 300 = 1,300 (guess) | 6,404 + 300 = 6,700 (old doc) |
| Output tokens | 350 | 350 | 350 |
| Cost per photo in USD | 0.00016 + 0.000175 = $0.00034 | 0.000325 + 0.000525 = $0.00085 | 29.5 + 21.5 = 51 neurons = $0.00056 |
| Per 1,000 photos in rupees | **about Rs 32** | **about Rs 82** | **about Rs 54** after the free 10,000/day |
| With heavy thinking | about Rs 90 | about Rs 150 | not applicable |

At 3 photos a day, a member costs Rs 3 to Rs 14 a month. A 500-member gym is Rs 1,500 to Rs 7,000 a month at full use, and most members log far fewer photos than that.

### 3.5 How the leading apps do it, and what goes wrong

| App | How it works (as published) | Known problems |
|---|---|---|
| **HealthifyMe Snap** (India) | Photo or gallery scan; the phone finds food pictures and sends only recognition data; trained on about 150,000 Indian food items; multi-item photos need the member to box each item. Company said 60 to 70 percent recognition at launch (2023), later 75 to 80 percent for **single** Indian foods; **struggled when a photo had several foods**. Its CTO said photo users log twice as often. No independent accuracy test found. Sources: https://techcrunch.com/2023/09/21/khosla-backed-healthifyme-introduces-ai-powered-image-recognition-for-indian-food , https://openai.com/index/healthify , https://inc42.com/?p=509087 (all company-reported) | Thali plates, mixed dishes. Users complain about paywalls on basic features (SECONDARY aggregator). |
| **Cal AI** | Phone camera plus an AI model; some versions use depth sensors; claims 90 percent on visible foods. | Hidden fat (oil, butter, ghee, cheese) does not show in a photo. A teardown cites a 102-meal study where AI apps under-counted by about 345 kcal per meal (vendor blog: https://www.raftlabs.com/blog/cal-ai-product-teardown, SECONDARY). |
| **SnapCalorie** | Uses LiDAR on iPhone Pro to measure volume; falls back to estimated portions on other phones; lets the user add a voice note ("pan-fried in olive oil"). Its own figure from the Nutrition5k data: about +/- 80 kcal on a 500 kcal dish with LiDAR, +/- 130 without (company numbers). Source: https://apps.apple.com/us/app/-/id1574239307 | Needs depth hardware; most Android phones in a gym have no LiDAR. |
| **MyFitnessPal Meal Scan** | I found no usable description or accuracy data. UNVERIFIED. | |

### 3.6 Accuracy evidence (independent studies)

| Study | Result | Source |
|---|---|---|
| 52 standard food photos, ChatGPT-4o vs Claude 3.5 Sonnet vs Gemini 1.5 Pro (Curr Dev Nutr, 9 Sep 2025) | Average energy error: ChatGPT 35.8 percent, Claude 35.8 percent, Gemini 64.2 percent. **All under-count more as the portion gets bigger.** Authors: not yet fit for precise dietary assessment, usable for screening. These are old models; today's are likely better but I found no newer peer-reviewed number. | https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/ (VERIFIED) |
| Four commercial AI calorie apps, 102 weighed meals (conference report, 2026) | Under-counted by 250 to 345 kcal per meal on average; worst on meals with hidden fat | Via search summary, SECONDARY (https://eastleighvoice.co.ke/health/383714/ai-food-apps-may-be-underestimating-your-calories-by-hundreds-study-finds). Original not read. |
| Research models on Nutrition5k (true weights, depth camera, US cafeteria) | About 16 to 19 percent mean error on calories with depth or volume; depth does not always help | https://arxiv.org/pdf/2406.01938 , https://arxiv.org/pdf/2309.07704 (summarised by search, SECONDARY) |
| Indian-food photo accuracy (independent) | **Not found.** Only company claims. | |

Plain reading: a good photo model gets the **dish name** right most of the time, but gets the **quantity and the oil** wrong by 20 to 40 percent, usually low. So the member must confirm quantity, and the app should show a range.

---

## 4. Algorithms

### 4.1 Daily calorie target

* **Mifflin-St Jeor** is the best-validated simple equation: in a review of equations it predicted resting metabolism within 10 percent of measured in more non-obese and obese adults than any other and had the narrowest error. The same authors warn errors can be large for individuals and some ethnic or age groups. (Frankenfield 2005, J Am Diet Assoc; VERIFIED via search snippet only, https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/ .) I could **not** confirm the often-quoted "82 percent" or any claim that it overestimates Indians; one blog says Western equations overestimate Asian populations by 5 to 10 percent (Soares 1993), UNVERIFIED.
* Formula (standard, not re-checked on a primary page today): men: 10 x kg + 6.25 x cm - 5 x age + 5; women: same minus 161. Then multiply by an activity factor: about 1.2 (desk, no training), 1.375 (light, 1 to 3 sessions a week), 1.55 (3 to 5 sessions), 1.725 (6 to 7 sessions), 1.9 (very hard plus physical job). Gym members are mostly 1.375 to 1.55; **MettleUp already knows how many sessions each member logs, so it can set the factor from real data** instead of asking.
* Goal adjustment (common practice, not sourced here): fat loss minus 15 to 20 percent, muscle gain plus 5 to 10 percent.
* Today's app uses a simpler 33 kcal per kg x goal factor. It is within a normal range for a moderately active adult, but ignores age, height and sex. A change to Mifflin-St Jeor needs height, age and sex, which the profile may not have (check `UserProfile`). Keep the rough formula as the fallback.

### 4.2 Protein

* ISSN position stand (2017): **1.4 to 2.0 g per kg a day** is enough for most people who train; **2.3 to 3.1 g per kg** is suggested when eating in a calorie deficit while lifting; 0.25 g per kg (about 20 to 40 g) per meal, spread every 3 to 4 hours. Source: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5477153/ (VERIFIED via search snippet).
* The app's 1.5 to 2.0 g per kg sits inside that. For fat loss it stays at 2.0, which is below the ISSN deficit range; do not raise it without the owner's view.
* ICMR-NIN's 2024 guidelines reportedly advise against protein supplements for the general public (news report headline; SECONDARY: https://thesouthfirst.com/news/icmr-releases-dietary-guidelines-for-indians-after-13-years-says-no-to-protein-supplements). Worth a note in the app's wording; I did not read the guideline text.

### 4.3 Portion estimation, ranked for Indian home food

| Approach | How it works | Accuracy / fit | Verdict |
|---|---|---|---|
| **Member confirms household portions** (count of rotis, katoris, pieces, scoops) | Photo gives the dish list; member taps "2 rotis, 1 katori dal"; app multiplies by stored grams | Best realistic accuracy; INDB has a serving size per recipe to start from | **Use this.** |
| Remembered "my katori / my plate" | Member sets their katori size once | Cuts the biggest home error (katoris vary a lot) | Add, cheap |
| Reference objects in the photo (plate or thali diameter, hand, coin) | Estimate size from a known object | Not tested on Indian plates here; UNVERIFIED | Maybe later |
| Depth or LiDAR | Measure volume | Works on iPhone Pro (SnapCalorie); not on typical Android; research shows depth does not always help | Skip |
| AI guesses grams from the picture | LLM estimates | Under-counts more as the portion grows (study in 3.6) | Use as a first guess only; show it as editable |
| Ask about oil and ghee | One tap: "little / normal / lots of oil" | Directly attacks the biggest hidden error (Cal AI and SnapCalorie both point at it) | **Use this.** |

---

## 5. Recommendation: the cheapest legal stack

### (a) Manual logging, Indian foods. Cost: Rs 0 running

1. A bundled **food table** in the phone's database (new additive tables, never an edit of `schema.ts`): foods (name, Hindi and Hinglish aliases, per 100 g calories, protein, carbs, fat, source, licence) and portions (food, label such as "1 roti, medium", grams). About 500 foods is enough for launch; size is well under 1 MB.
2. Search box with Hinglish aliases ("chapati", "phulka", "roti" all find one item), a portion picker (piece, katori, gram), "recent" and "my meals", saved katori size. The existing `meals` table already stores the four numbers; add the food name and grams as description.
3. Data order: USDA (CC0) for raw items and shakes; our own recipe-built Indian dishes; IFCT values the moment NIN says yes; INDB rows the moment its authors confirm a licence; Open Food Facts for barcodes (live lookup, credit shown).
4. Show the totals as "about", not exact.

### (b) Photo logging. Cost: about Rs 30 to Rs 150 per 1,000 photos

1. The phone shrinks the photo to about 1,000 px and sends it to **our own small server function** (a Cloudflare Worker on the owner's account), never straight from the app, so the API key is not inside the APK and we can cap use (for example 10 photos per member per day).
2. The function asks a vision model for **only a list**: dish names (matched to our food table), how many pieces or katoris, and oil level. It must not return calories.
3. The app looks up calories from the food table, shows editable chips ("Roti x2, Dal 1 katori, Paneer sabzi 1 katori, little oil"), and the member confirms. Saved as `source = 'photo'` with the photo kept on the phone only.
4. Model choice: run a **100-photo bake-off** on real Indian home plates (the owner's gym members' meals, with consent) between Cloudflare Llama 3.2 11B (free), Claude Haiku 5.5 and Gemini 3.1 Flash-Lite (paid). Pick the cheapest that names the dish right most of the time. Start with Cloudflare's free units for the pilot, then switch to a paid no-training model.
5. Do not ship a food-photo model trained by us until a clean, licensed Indian photo set exists.

### Cost summary

| Item | Rupees |
|---|---|
| Food data (USDA, own recipes, OFF) | 0 |
| IFCT / INDB permission emails | 0 (a lawyer's opinion, if wanted, is extra: price unknown) |
| Photo, pilot on Cloudflare free units | 0 up to about 195 photos a day in total |
| Photo, paid no-training API | about Rs 32 to Rs 150 per 1,000 photos; Rs 3 to Rs 14 per active member per month at 3 photos a day |

---

## 6. Top 3 risks

1. **Data rights.** IFCT needs NIN's written permission for products, INDB has no licence file, and the `ifct2017` package is AGPL code with no NIN permission shown. Shipping any of them unasked risks a takedown or a legal letter. **Fix:** email NIN and the INDB authors now; launch on USDA plus our own recipes; get a lawyer's opinion before launch.
2. **Photo numbers are not trustworthy by themselves.** Independent tests show 20 to 40 percent average error, getting worse for bigger plates, and apps under-count by hundreds of kcal on oily food. A member who eats 600 kcal more than logged will stop trusting MettleUp. **Fix:** member confirms quantity, oil question, show a range, label everything "estimate", test on real Indian plates before release, and add a plain disclaimer (Gemini's terms also forbid medical-advice use).
3. **Privacy and the app's promise.** Meal photos are personal data and today's promise says food never leaves the phone. Free AI tiers (Gemini free) train on and let humans read the data; Gemini also bars under-18 use. **Fix:** only no-training paid or Cloudflare endpoints, via our own function, no photo storage on the server, a clear one-time consent screen, update the "food never leaves the phone" wording, block or gate under-18 members, and check India's DPDP Act duties (not researched here). Also cap photos per member, because a leaked key or a script could run up a bill.

Bonus risk: prices and models change fast (Gemini 3.8 Flash doubles on 1 Jan 2027; the owner's notes record Groq retiring models). Keep the model name in one setting and re-run the bake-off twice a year.

---

## 7. Open questions for the owner

* Permission to email NIN and the INDB authors from the MettleUp address (free).
* Ok to run the 100-photo bake-off using real members' meal photos with their consent (costs under Rs 15 in API calls).
* Whether under-18 members may use photo logging.

## 8. Could not verify (so you do not rely on it)

* Any specific katori volume or cooked-food weight from the ICMR-NIN 2024 guideline (PDF not readable here).
* The exact number of tokens an image costs on Cloudflare Workers AI today, on OpenAI and on Gemini (pricing pages do not say; figures above are estimates).
* LogMeal, Passio, Calorie Mama, Nutritionix and Edamam prices; MyFitnessPal Meal Scan method and accuracy.
* Any independent accuracy test on Indian home food photos.
* Licence of UECFOOD-256, Kaggle and Hugging Face Indian food sets, the Khana dataset, and the Mendeley packaged-food set.
* Whether UK CoFID has Indian dishes; whether FatSecret Premier covers India.
* Whether Mifflin-St Jeor over-estimates Indian adults (only a blog claim).
* Mifflin-St Jeor formula constants and activity multipliers (standard values, not re-read on a primary page today).
* Indian law on copyright in factual compilations and on DPDP consent for meal photos.
