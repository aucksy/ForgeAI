# Ready-made diet plans: where every number comes from

R-532 (owner, 14 Nov 2026): the six ready-made diet plans in the gym dashboard (Diet plans → "+ New plan")
must be veg and non-veg for every goal, safe, and scientifically right. The plans live in
`apps/dashboard/src/crm/logic/dietPlans.ts` (`FOODS`, `STARTER_DIETS`). `apps/dashboard/test/crm/dietPlans.test.ts`
adds every plan up from the food table and fails if a plan's stated calories are more than 5% off, or its
protein more than 10% off. The same test checks that every food code below is written in this file.

## Who the plans are for

An adult of about 60 to 70 kg who trains 3 to 5 days a week. The protein checks use 65 kg, the middle of that
range. ICMR-NIN "Nutrient Requirements for Indians" (2020) uses a 65 kg reference man and a 55 kg reference
woman; for context, their energy needs at moderate activity are about 2,710 kcal (man) and 2,130 kcal (woman).
So the maintenance number (2,200 kcal) fits a woman who trains or a lighter man; every plan tells the member
how to adjust (add or take away 1 phulka) from their weekly weight.

## The six plans (stated, and added up from the table)

| Plan | Stated kcal | Added up | Stated protein | Added up | Protein per kg at 65 kg | Oil | Vegetables |
|---|---|---|---|---|---|---|---|
| Fat loss veg · 1,600 kcal | 1,600 | 1,631 (+1.9%) | 85 g | 86 g | 1.3 g/kg | 25 g (5 tsp) | 420 g |
| Fat loss non-veg · 1,600 kcal | 1,600 | 1,610 (+0.6%) | 95 g | 97 g | 1.5 g/kg | 25 g (5 tsp) | 440 g |
| Muscle gain veg · 2,600 kcal | 2,600 | 2,620 (+0.8%) | 115 g | 119 g | 1.8 g/kg | 30 g (6 tsp) | 460 g |
| Muscle gain non-veg · 2,600 kcal | 2,600 | 2,592 (-0.3%) | 125 g | 129 g | 1.9 g/kg | 30 g (6 tsp) | 440 g |
| Maintenance veg · 2,200 kcal | 2,200 | 2,241 (+1.9%) | 95 g | 95 g | 1.5 g/kg | 25 g (5 tsp) | 450 g |
| Maintenance non-veg · 2,200 kcal | 2,200 | 2,234 (+1.5%) | 120 g | 120 g | 1.8 g/kg | 25 g (5 tsp) | 400 g |

"Veg" means no eggs, meat or fish (many Indian vegetarians do not eat eggs): protein comes from dal, besan,
rajma, sprouts, soya chunks, paneer, milk and curd. "Non-veg" adds eggs, chicken and fish. The test checks
that no veg plan has an egg, meat or fish line.

## How a line is counted

- Every weight in a plan is of **raw or dry** food, as weighed before cooking: "2 phulka (60 g atta)",
  "1 bowl dal: 30 g dry toor or moong dal, 1 tsp oil", "Rice: 50 g dry rice (about 150 g cooked)".
- 1 phulka = 30 g atta, no ghee. 1 tsp oil = 5 g. Milk in ml is counted as grams.
- A cooked dish is counted from its parts: e.g. "Paneer bhurji: 100 g paneer, 1 tsp oil" = 100 g paneer + 5 g oil.
  Salt, spices, lemon and water are not counted (they add almost no calories or protein).
- Where a line gives a choice, the table counts the option with the most calories, so a plan never says less
  than it gives: "1 apple, guava or orange" is counted as apple; "toor or moong dal" as toor; "rohu or katla"
  as rohu (katla has about 9% less protein).
- Whey and protein powder are never in a meal. The muscle gain plans say they are not needed and are optional,
  for adults only.

## The food table (per 100 g as weighed)

IFCT 2017 = Longvah T, Ananthan R, Bhaskarachary K, Venkaiah K. *Indian Food Composition Tables 2017*.
National Institute of Nutrition (ICMR), Hyderabad. https://nin.res.in/ebooks/IFCT2017.pdf. Values read
from the machine-readable copy of the tables (github.com/nodef/ifct2017, `compositions/index.csv`: energy
`enerc` in kJ, protein `protcnt` in g). kcal = kJ / 4.184.

| Food | Code | kJ | kcal | Protein g |
|---|---|---|---|---|
| Wheat flour, atta | A019 | 1,340 | 320 | 10.57 |
| Rice, raw, milled | A015 | 1,491 | 356 | 7.94 |
| Rice, flakes (poha) | A011 | 1,480 | 354 | 7.44 |
| Green gram, dal (moong dal) | B010 | 1,363 | 326 | 23.88 |
| Green gram, whole (for sprouts) | B011 | 1,229 | 294 | 22.53 |
| Red gram, dal (toor dal) | B021 | 1,384 | 331 | 21.70 |
| Bengal gram, dal (besan is this dal, ground) | B001 | 1,377 | 329 | 21.55 |
| Rajmah, red | B020 | 1,252 | 299 | 19.91 |
| Paneer | L003 | 1,079 | 258 | 18.86 |
| Milk, whole, cow | L002 | 305 | 73 | 3.26 |
| Egg, poultry, whole, raw (1 egg = 50 g) | M001 | 564 | 135 | 13.28 |
| Egg, poultry, whole, boiled | M004 | 618 | 148 | 13.43 |
| Egg, poultry, white, raw (1 white = 33 g) | M002 | 187 | 45 | 10.84 |
| Chicken, poultry, breast, skinless | N003 | 704 | 168 | 21.81 |
| Rohu | S006 | 428 | 102 | 19.71 |
| Ground nut (peanuts) | H012 | 2,176 | 520 | 23.65 |
| Almond | H001 | 2,549 | 609 | 18.41 |
| Banana, ripe, robusta (1 banana = 100 g without the peel) | E012 | 440 | 105 | 1.23 |
| Apple, big | E001 | 261 | 62 | 0.29 |
| Cucumber, green, elongate | D043 | 82 | 20 | 0.71 |
| Tomato, ripe, local | D076 | 82 | 20 | 0.90 |
| Onion, big | G017 | 201 | 48 | 1.50 |
| Mint leaves (for chutney) | G016 | 155 | 37 | 4.66 |
| Sabzi vegetables: average of cauliflower D036, cabbage C015, French beans D050, lauki D007, bhindi D056, brinjal D031 | D036, C015, D050, D007, D056, D031 | 91 | 22 | 1.62 |
| Cooking oil or ghee (groundnut T005, mustard T006, ghee T013: 100 g fat) | T005, T006, T013 | 3,700 | 884 | 0 |

IFCT 2017 lists oils and ghee as 100 g fat but leaves their energy blank, so oil uses IFCT's own energy
factor for fat, 37 kJ per gram (884 kcal per 100 g; 1 tsp = 44 kcal).

Three foods are not in IFCT 2017:

| Food | kcal | Protein g | Source |
|---|---|---|---|
| Curds, cow milk | 60 | 3 | Gopalan C, Rama Sastri BV, Balasubramanian SC. *Nutritive Value of Indian Foods*. NIN (ICMR), 2004 (as reproduced in TNAU Agritech's milk table) |
| Bengal gram, roasted (roasted chana) | 369 | 22 | Same book, 2004 (TNAU Agritech's pulses table) |
| Soya chunks, dry | 345 | 52 | Nutrela pack label, the most common brand (other packs say 345 to 354 kcal and 51 to 53 g protein) |

## Safety rules the plans follow, and their sources

| Rule in the plans | Source and number |
|---|---|
| Fat loss is never below about 1,500 kcal a day, and loses about half a kilo a week at most | MettleUp's own floor for a 60 to 70 kg adult who trains (owner brief R-532); 1,600 kcal is below the ICMR-NIN 2020 energy need of both reference adults, so it is a real but gentle deficit |
| Protein: fat loss 1.2 to 1.6 g per kg; muscle gain and maintenance 1.4 to 2.0 g per kg (at 65 kg) | Jäger R et al. International Society of Sports Nutrition position stand: protein and exercise. *J Int Soc Sports Nutr* 2017;14:20 (1.4 to 2.0 g/kg/day for most people who exercise) |
| Protein comes from food; whey is never needed, optional and for adults only | ICMR-NIN *Dietary Guidelines for Indians* 2024 (the protein guideline): get protein from food combinations; "protein powders are unnecessary"; cereals with pulses about 3:1 |
| Salt under 5 g a day (1 level teaspoon), counting pickle, papad and namkeen | ICMR-NIN DGI 2024 (the salt guideline): added salt at most 5 g a day; WHO *Guideline: Sodium intake for adults and children* (2012): under 5 g salt a day |
| No sugar in tea; sweets, fried snacks and sugary drinks only once a week | ICMR-NIN DGI 2024: sugar under 5% of energy; limit high fat, sugar and salt (HFSS) and ultra-processed foods |
| At least 400 g of vegetables a day, one green leafy sabzi a day | ICMR-NIN DGI 2024: at least 400 g of vegetables a day, green leafy vegetables in meals |
| Cooking oil 25 to 30 g a day (5 to 6 teaspoons), stated in each plan | ICMR-NIN DGI 2024: use oils and fats in moderation; limit ghee and butter. The test caps every plan at 30 g |
| Drink enough water to keep urine pale yellow | ICMR-NIN DGI 2024: drink adequate safe water; prefer water, buttermilk, lemon water to soft drinks |
| No fasting, detox, supplements or medical claims | Owner brief R-532. The test refuses "cure", "guarantee", "detox", "cleanse", "fasting" in any plan |
| Ask a doctor first: under 18, pregnant or breastfeeding, diabetes, high BP, kidney disease, a food allergy; and the doctor line on every plan | Owner brief R-532 (`CHECK_FIRST` and `DOCTOR_LINE` in dietPlans.ts; the test checks every plan has both). ICMR-NIN DGI 2024 gives pregnancy, breastfeeding and childhood their own guidelines; kidney disease often needs less protein, and diabetes and high BP change what to eat |

ICMR-NIN *Dietary Guidelines for Indians* (2024), National Institute of Nutrition, Hyderabad:
https://nin.res.in/downloads/DGI_Booklet_English_CMYK.pdf.

## Changing a plan

Change the line's words and its weights together in `STARTER_DIETS`, then run the test file. If the stated
calories or protein drift past 5% or 10%, change the stated number (and so the plan's name) or the food, and
update the plans table above.
