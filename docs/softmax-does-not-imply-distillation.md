# softmax does not imply distillation

**English** · [中文](softmax-推不出蒸馏.md)

Someone dropped two screenshots into a group chat. Two models, same formatting, same phrasing, even the same punctuation habits. The verdict came fast: the second one is a distillation of the first.

I have heard this a lot. Always said with confidence. Confident enough that I wanted to check whether it holds up.

So I built a small tool. I took the same math and changed only the subject. Instead of deciding which vendor a model belongs to, it decides which breed a dog belongs to. The algorithm is untouched, line for line. With the subject swapped, the percentage shows what it was always made of.

## One question asked two ways

Whether a model is a cat person or a dog person, and whether a model was distilled from some other model, are the same question asked two ways.

Both ask "what does this look like". Both answer with similarity. Both produce a number with four decimal places. The only difference is that everyone treats the first one as a joke and the second one as a finding.

I want to talk about the second half. A percentage that looks precise can carry zero evidence.

Precision and evidence are separate quantities.

## How it works

Ask the model for N integers between 1 and 355, from first instinct, no tools. Ask three times, keep three outputs.

Turn each output into two features. The first is a 355-dimensional count histogram, run through a Hellinger transform. The second splits the sequence into four position blocks of 16 value bins each, plus a final-digit distribution, for 74 dimensions. Both are smoothed so no bin ends up at zero.

At bank-building time, estimate nuisance directions from the mean offsets across environments and project them out with a rank-2 SVD. The intent is to strip the effect of the prompt template.

Project the sample the same way, then take the cosine similarity against every breed centroid in the bank. Fuse the two feature paths at 0.75 and 0.25, then standardize within class to get z-scores.

Average the three outputs per class, multiply by temperature beta, run one global softmax. Out come 24 attribution probabilities.

Family probability is the sum of its members. Take the largest family.

Beta is fit by minimizing NLL over grouped cross-validation. The grid is 801 log-spaced points on [0.05, 12.0].

That is the whole thing. Nowhere in it does anything touch training data, weights, or distillation records.

## Why it gives a confident answer

Three mechanisms stack up.

First, z-standardization forces unit variance. After that step, it does not matter how far the input sits from every candidate; it gets scaled to unit variance anyway. The information "this is far from everything" is erased right there. What survives is relative rank: who is first, who is second. The input itself stops mattering.

Second, beta hits the cap. Measured across two-query and three-query runs, beta comes out at 11.99999999999999, which is exactly the right endpoint of the search grid. The fit wants to go sharper. The grid has run out. Larger beta means a sharper softmax, and at the limit softmax becomes one-hot: the top candidate takes everything.

Third, the closed set. The softmax denominator normalizes over the 24 candidates in the bank only. There is no "none of the above" slot. Anything from outside the bank still gets assigned to whichever candidate looks closest.

Put the three together and any input lands near 1.

Including pure random integers with no relationship to any breed in the bank.

I tried five seeds. Draw uniform integers from 1 to 355 with random.Random(seed), matching the length of the sample's three queries. Across the five seeds, family probability lands between 78.4612% and 99.9999%.

The verdicts split across both families too. Seeds 1 and 2 land in the cat family. Seeds 3, 4, and 5 land in the dog family.

Noise scores as high as the real mixed sample. The sample is one we built ourselves: 0.80 parts dog baseline, 0.20 parts cat baseline, family probability 99.9999%. It at least has a generative relationship to one family in the bank. Random integers have zero relationship to anything in the bank, and the best seed still reached 99.9999%.

None of the three mechanisms is a bug on its own.

z-standardization is standard practice, meant to make scores with different scales comparable. Beta calibration is standard practice, meant to turn scores into probabilities. The closed set is standard practice too, provided you have already fixed the candidate range.

The problem appears when the three stack. On its own, each still says "relative rank". Together they produce a number that reads like "absolute certainty". Everyone who built it made a reasonable choice at every step. Whoever uses it receives something else.

That is the entire meaning of the percentage: who ranks first inside a closed set.

## What "looks like" can actually tell you

Similarity has many sources.

The same prompt template produces similarity. The same sampling temperature produces similarity. The same tokenizer, the same system prompt, the same alignment data, all produce similarity. Sometimes it is just coincidence.

The more common truth tends to be boring: the same API gateway, the same upstream channel, the same version number.

The clearest case of this I have seen goes like this. Two models return similar formatting and phrasing for the same prompt set, and someone concludes that A is a distillation of B. But the part of formatting and phrasing determined by prompt and sampling parameters is much larger than the part determined by model weights. Ask two vendors the same question through the same template and you get similar layout. That is not surprising at all.

This kind of inference has another property: it is very hard to refute.

The accused side cannot prove a negative. You cannot hand over training logs and say "look, I am not in there". The accusing side only needs to find one more similarity and can say the evidence got stronger. The burden of proof lands on the wrong party.

A method that cannot reach a conclusion, paired with an evidentiary rule that cannot be refuted, and the two together are enough. The data does not have to be right. The other side just has to run out of words.

Using a thermometer as a DNA test is roughly the idea. The reading is accurate. It did measure something. What it measured is not the thing you wanted.

## What a finished run looks like

Back to the tool.

The sample, Clapt, comes out with family probability 99.9999% for the dog family. The specific breed is Bulldog, attribution probability 63.72%.

The last line of the report reads: "Therefore Clapt is distilled from the dog family."

That line is generated by code. The format is identical to a real conclusion.

The temperature calibration is in the report too: one query gives beta 8.010150, two and three queries both give 11.99999999999999. Two and three are pinned to the right endpoint of the grid.

There is a separate JS implementation of the same thing, running in the browser. I compared the two field by field using the same bank and 75 inputs: 24 enrolled breeds plus the one test sample, three queries each. All 75 verdicts matched. Numeric differences sat around 1e-15, the largest at 1.2e-15, a dozen or so double-precision ulps. A different batch of inputs moves that maximum; the order of magnitude does not change. The source is accumulation order in the 355-dimensional dot products, not the algorithm.

Reproduction fidelity is something I got right. The number coming out is correct. What went wrong is what the number gets read as.

## The target is the move

The move I want to go after is "the output style looks similar, so one is distilled from the other".

Not a specific person. Not a specific company. The move is common enough that it has become a reflex: see similarity, assume common origin.

It looks impressive. There is data, there is a pipeline, there is a number with four decimal places. The chain of evidence is broken. Between "the number distribution looks similar" and "one was trained on the other", nobody supplies the missing step.

That step cannot be supplied, for a plain reason. Similarity is a statistic of the output layer. A training relationship is a fact about the process. There is no entailment between them. You can have a pile of similarity metrics all pointing the same way and still know nothing about how either model was trained.

## This project does not accuse anyone

It just enlarges that percentage until you can see what it is made of.

The number is real. The conclusion is not. Between them sit three mechanisms and one capped temperature.

Once you can see that, the percentage still has a use. As a ranking score for "which candidate looks closest in a given set", it means something. Do not read it as "who gave birth to whom".
