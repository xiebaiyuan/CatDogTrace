# DogCatTrace

> **This is a joke project, not a research tool.**
>
> Using a formula like "similarity between number distributions + closed-set softmax" to decide whether one model was distilled from another model or model family is absurd. Similarity is not common ancestry. This repo runs that math end to end without changing a single step, so the gap is impossible to miss.
>
> The breeds, breed families, and "distillation" in here are props. The numbers are synthetic, the test subject is fictional, and none of the eight breeds in the bank exist. No percentage in this repo is a statement about any real model.

Chinese version: [README.md](README.md)

DogCatTrace is a breed attribution tool. It extracts an output fingerprint from three independent integer-generation challenges, then decides the dog or cat breed family and the specific breed from a single candidate bank.

## Cat person or dog person: which one is your model?

Three challenges, three strings of random integers, paste them back. You find out whether your model is a cat person or a dog person, and it picks up a breed persona along the way.

**How to play**

1. Copy the three challenges from the page and send them to your model as-is.
2. Have it answer from first instinct with a string of integers from 1 to 355. No tools.
3. Paste all three outputs back into the page and read the result.

**Reading the result**

The breed family tells you cat person or dog person. Husky family is dog person, ragdoll family is cat person. The specific breed is your model's anime persona.

| Breed | Family | Persona |
|---|---|---|
| Husky-2.0 | dog person | Way too much energy. Tail going like a propeller, answers once and keeps going |
| Husky-3.1 | dog person | Version number went up, composure mostly didn't. Still jumps when you walk in |
| Husky-3.1-pro | dog person | Well-trained working dog. Follows every command, chews the furniture the moment you leave |
| Alaskan Mix-2.0 | dog person | Big and easily spooked. Loves everyone, hides behind you the second a cat hisses |
| Ragdoll-4.6 | cat person | Ice cold. Ignores its name twice, looks mildly offended the third time |
| Ragdoll-5.0 | cat person | Does whatever it wants. Cuddles on its schedule, treats you as furniture otherwise |
| Siamese-2.0 | cat person | Never stops talking. Loud, a little rude, sneaks into bed at 3am |
| Orange Tabby-7B | cat person | Peak laziness. Eats, sleeps, nothing else. Weight goes up with the version number |

This verdict is like whatever card you pull. It's computed, not measured.

## Three ways to run it

- Hosted: https://xiebaiyuan.github.io/DogCatTrace/ . Nothing to install. Attribution and bank loading both happen in the browser, no backend needed.
- Offline: double-click static/DogCatTrace-standalone.html. One self-contained file, works without a network.
- Local server: see the next section, full API included.

## Running

    python3 -m pip install -r requirements.txt
    python3 start.py

The page is at http://127.0.0.1:7860/ . Set DOGCATTRACE_NO_BROWSER=1 to stop it from opening a browser on startup.

The full pipeline runs in five steps, in order:

    python3 enrollment.py --seed 20261017
    python3 bank_builder.py --responses data/husky_reference.jsonl --output data/husky_bank.json
    python3 bank_builder.py --responses data/ragdoll_reference.jsonl --output data/ragdoll_bank.json
    python3 rebuild_unified_bank.py
    python3 report.py

Step one writes the two synthetic reference corpora. Steps two and three fit one bank per family. Step four merges them into a single global bank and writes byte-identical copies to data/unified_bank.json and static/data/unified_bank.json. Step five runs one attribution and writes docs/归因报告.md.

Tests:

    python3 -m pytest tests/

## Usage

- Manual: copy the three challenges from the page, send them to the same test subject one at a time, then paste each complete output back.
- Attribution: submit the three outputs. The tool parses the integer sequences, extracts fingerprints, and computes per-breed and per-family probabilities against the unified bank.
- Bank inspection: the page can read the current model roster, sample counts, and calibration parameters.

A single output needs at least 80 integers in 1..355, otherwise it is dropped. With fewer than three valid outputs the tool falls back to the calibration temperature for the count it actually has and reports how many queries it used.

## Fingerprinting method

### Core algorithm

Every breed shares one global feature space and one set of features and weights:

    0.75 x Hellinger breed-centroid similarity, after projecting out environment directions
    + 0.25 x ordered-block sequence feature

Each output is parsed into an integer sequence, then two features are computed. The marginal feature is a 355-dimensional count vector run through a Hellinger transform with alpha = 0.5. The ordered feature splits the sequence into 4 position blocks of 16 value bins each, plus a final-digit distribution, for 74 dimensions total, also Hellinger-transformed.

Bank building estimates nuisance directions from the mean offsets of shared environments. At attribution time those directions are projected out of both features before the cosine similarity against every breed centroid. The three responses are scored separately, averaged per class, then converted to probabilities with the calibration temperature for the query count.

### Probabilities and family probabilities

Per-breed probability comes from one global softmax. Family probability is the sum of the breed probabilities inside that family:

    P(specific breed) = softmax(beta x global breed score)
    P(breed family)   = sum of P(breed) over that family

Beta is found by minimizing negative log-likelihood over a grouped cross-validation search on [0.05, 12.0].

Calibration results for this run, taken from the summary table in docs/归因报告.md:

| Item | Value |
|---|---|
| Queries | 3 |
| Calibration temperature beta | 12.000000 |
| Cross-validation accuracy cv_accuracy | 100.00% |
| Breeds in the bank | 8 |
| Reference samples in the bank | 288 |

The three-query beta for this run is 12.000000, pinned to the right end of the search range. A single query does not hit the cap: its beta is 7.479766.

These are closed-set probabilities under a uniform prior, over the current candidate bank only. An unlisted sample still gets assigned to whichever existing candidate looks closest.

### Control group

Uniform random integers have no generative relationship to any breed in the bank, and the pipeline still returns high family probabilities for them. The measured results across five seeds are in the "Control group" section of docs/归因报告.md.

## Project layout

    app.py                   web API
    start.py                 local server entry point
    fingerprint.py           fingerprint extraction and attribution
    bank_builder.py          bank construction and probability calibration
    challenge_suite.py       challenge suite used for bank building
    enrollment.py            synthetic breed corpus generation
    rebuild_unified_bank.py  rebuild the unified global bank
    report.py                attribution report generator
    data/                    reference corpora and fingerprint banks
    docs/                    attribution report, target breakdown, ADRs
    static/                  page assets
    templates/               page templates
    tests/                   contract tests

The challenge suite has 12 environments with 3 queries each, 36 in total. Environments differ only in the outer wrapper (none, system prefix, user prefix) and the target count. The task text is fixed.

## The breed bank

The unified bank holds two breed families and 8 breeds, 4 members each:

| Family | ID | Members |
|---|---|---|
| Husky family | husky | Husky-2.0, Husky-3.1, Husky-3.1-pro, Alaskan Mix-2.0 |
| Ragdoll family | ragdoll | Ragdoll-4.6, Ragdoll-5.0, Siamese-2.0, Orange Tabby-7B |

Each breed has 36 reference samples, 3 queries from each of 12 environments, for 288 across both families.

The test subject, Laowang-v9 (laowang-v9), is deliberately kept out of the bank. Its weight vector is a 0.80 husky / 0.20 ragdoll baseline mix with an extra peak at value 111.

The reference corpus is produced by a parameterized generator that makes no network calls. Each breed gets a 355-dimensional weight vector, built by multiplying four components: Gaussian peaks, a value-band lift, a last-digit bias, and a position drift. Sampling normalizes the weights per position and draws categorically. Member variation comes from deterministic phase perturbation, so the same seed always yields the same corpus.

Both families have 4 members, so family probabilities are directly comparable. Adding members means adding them to both families in step, otherwise family probability reflects member count rather than similarity.

## Caveats

Results are indicative only. They are not decisive evidence about where a breed came from.

This is an attribution tool. It tries to tell which of the breeds in the bank a sample most resembles. If the sample is not in the bank, any result is possible.

These are closed-set probabilities. The denominator is fixed to the number of candidates in the bank, so every input gets a confident-looking answer, including inputs that are nowhere near the bank.

The input to the probabilities is similarity between number distributions. The tool never reads training data, weights, or provenance records.

Every percentage in the report comes from one real run. None are hand-written. Rerunning report.py produces results tied to that corpus and seed.

## Reality check

Treating the percentages out of this formula as evidence of distillation is the joke this project exists to tell.

For the long-form version of why this formula produces confident answers, see [softmax 推不出蒸馏](docs/softmax-推不出蒸馏.md) (written in Chinese).

This section breaks down the four reasoning moves the tool reproduces. Outside this section and docs/satire-targets.md, every other file in the repo describes the method at face value.

Start with one measurement. Feed uniform random integers, which have no generative relationship to any breed in the bank, through the same pipeline. Across five seeds the family probabilities land between 81.7282% and 99.9990%, splitting across both families. Details in the "Control group" section of docs/归因报告.md.

### T1 The probability input is similarity between number distributions

The softmax input is a cosine similarity computed from random numbers, and the output is named probability. Similarity carries no provenance: the same prompt template, the same sampling temperature, the same tokenizer, or the same wrapper text all produce similarity, and two independent sources can also happen to favor the same batch of numbers.

Where the reasoning breaks: between "the number distribution looks like candidate A" and "the sample came from candidate A", there is a step nobody supplies. The tool never touches training data, weights, or distillation records.

### T2 Family probability is the sum of member probabilities

Family probability equals the sum of its members' probabilities. Summing is aggregation, not identification. One family has 4 members and the other has 4, so the share reflects how concentrated the member probabilities are. There is no logical path from that share to which family is the source.

Summing also collapses two very different situations into one number: one member in the family looking very similar, versus every member looking slightly similar. In this run, Alaskan Mix-2.0 gets 68.08% per-breed probability while the husky family gets 99.9971%. Those two numbers say different things.

Where the reasoning breaks: between "this family's summed member probability is the largest" and "this family is the sample's ancestor", a step is missing.

### T3 The search cap on temperature beta

Beta is searched over [0.05, 12.0], 801 grid points spaced logarithmically. In this repo's unified bank, the one-query beta is 7.479766, and both the two-query and three-query betas are 11.99999999999999. Two and three queries land on the cap, which means the optimum is outside the range and the search is truncated.

The larger beta gets, the sharper the softmax. As beta goes to infinity, softmax degenerates into one-hot and the top-scoring candidate takes all the probability. Once cross-validation accuracy is near its ceiling, negative log-likelihood still falls as beta grows, so the fit keeps pushing beta to the boundary. The absolute size of the probability is then set by the right end of the search range, not by the data.

Where the reasoning breaks: reading a percentage produced this way as a level of confidence means reading a scaling factor clipped by the search range as a confidence measure. The three-query beta for this run is 12.000000, which is exactly that cap.

### T4 Closed set and uniform prior

The candidate set is a fixed 8 breeds. The softmax denominator normalizes over those 8 only, so the 8 probabilities always sum to 1. A sample from outside the bank still gets assigned to the closest candidate and receives a number that looks like a probability. There is no "none of the above" slot in the denominator.

A uniform prior means all 8 candidates are treated as equally likely up front. Real-world breed popularity, version lineage, and family member counts would all make the prior uneven, and none of that information enters the calculation.

cv_accuracy measures in-bank self-identification: group by environment, hold out queries, and check whether the held-out samples can be recognized as their own breed. This run's three-query cv_accuracy is 100.00%. That number only says in-bank samples can be matched back to themselves. It says nothing about samples outside the bank.

Where the reasoning breaks: between "A looks closest among these 8 candidates" and "this sample is A", a step is missing. The closed-set assumption hides the gap, because the denominator is always 8 and every input gets a confident-looking answer.

### What the four targets have in common

The four targets are the same move performed four times: compute a similarity or a sum, scale it up with a factor that may be clipped by a search range, normalize over a closed candidate set, then name the resulting decimal a probability and read it as a causal claim.

Each step stands on its own. The break is in the last one: from similarity to common ancestry, nobody supplies the missing step.

Full breakdown: docs/satire-targets.md. Precise usage of the four terms: GLOSSARY.md.

## Friends

- [LINUX DO](https://linux.do/)
