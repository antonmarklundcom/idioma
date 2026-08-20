# Curriculum map — `en>es-speaker` (Paraguayan Spanish speaker learning English)

**Status:** pass-1 output, owner-editable. Input to pass 2 of
`content/prompts/curriculum-generation.md`. Freeze before lesson generation starts.

**Provenance:** authored directly (Opus 5, August 2026) rather than drafted by Gemini — the
`es-PY>en-speaker` map already existed, and building this one as its deliberate mirror was worth
more than an independent draft. See "Why it mirrors the Spanish map" below.

**Learner:** the owner's partner. Coaching profile per PLAN.md §9 Q9: `confidence_first` — the
goal is getting her *speaking*, not getting her accurate. Target outcome §9 Q11: functional
independence in daily life in an English-speaking country (≈ CEFR B1–B2).

**Target variety:** General American English. Explanations, intros and exercise prompts are in
Paraguayan Spanish with voseo (`¿cómo decís...?`, `fijate`, `vos podés`) — that is the seeded
`correctionStyle` for this pair in `scripts/seed.ts`, and the lesson text should match it.

## What `confidence_first` changes about this map

This is not the Spanish map with the columns swapped. The coaching profile is a real design
input (§11.3), and it shows up in three places:

1. **Earlier open-ended prompts.** The Spanish deck ramps discrete → open. Here the *second or
   third* exercise in most lessons is already open-ended, because a learner who is afraid to
   speak needs the win before the drill, not after it.
2. **Fluency-blocking errors are sequenced early; accuracy-only errors are sequenced late.**
   Third-person `-s` is the classic Spanish-speaker English error, and it is also almost never a
   *communication* failure — "she work here" is understood perfectly. So it is not fought in
   lesson 1; it gets its own natural home at #11, where talking about other people makes it
   unavoidable. What *does* come early is anything that breaks comprehension: question word
   order (#2), `fifteen`/`fifty` (#3), and the `have`→`be` swap for age (#1), because "I have
   30 years" genuinely stops a conversation.
3. **Listening is load-bearing, not decorative.** She will understand less than she can say —
   the usual asymmetry for a Spanish speaker in the US, where fast connected speech and swallowed
   function words are the real barrier. `listen_prompt` starts at #3 (one position earlier than
   the Spanish deck) and every A1 lesson from there has at least one.

## Why it mirrors the Spanish map

Positions 1–12 cover the same situations as `es-PY-en-speaker.md`, in nearly the same order.
That is deliberate and worth keeping through any future edit: **the two beta users are learning
opposite directions of the same curriculum.** When she is on lesson 4 and he is on lesson 4,
they have just studied the same situation from opposite sides and can practice it together —
which is the single cheapest source of speaking practice either of them will ever have, and it
costs nothing to design for. It also means a fix to one map's sequencing is usually a fix to
both.

The mirroring is at the level of *situation*, never of vocabulary. The Paraguayan deck teaches
tereré and chipa; this one teaches the American counterparts (the coffee-shop counter, the
tipping question) rather than translating Paraguayan life into English.

## The map

| position | level | topic | title | can-do statement | 5–8 key vocab/structures | recycles |
|---|---|---|---|---|---|---|
| 1 | A1 | first-encounters | Hi, I'm... | The learner can introduce themselves, say where they're from and what they do, and ask the same of someone else in a casual setting. | I'm..., where are you from?, I'm from Paraguay, what do you do?, nice to meet you, I'm 30 (never "I have 30"), this is my... | — |
| 2 | A1 | clarification | Sorry, could you repeat that? | The learner can keep a conversation alive when they miss something — ask for repetition, slower speech, or a spelling — instead of nodding and losing the thread. | sorry?, could you repeat that?, could you say that again more slowly?, how do you spell that?, what does ... mean?, how do you say ... in English?, I didn't catch that | Lesson 1 (names to spell and re-ask) |
| 3 | A1 | numbers-prices-money | How much is it? | The learner can understand and say prices, handle dollars and cents, and confirm an amount they only half-heard. | how much is it?, dollars / cents, fifteen vs fifty, thirteen vs thirty, that's $4.99, do you take card?, can you say that again? | Lesson 2 (asking for the number again — the highest-value recycle in A1) |
| 4 | A1 | ordering-food-and-coffee | At the counter | The learner can order food or coffee at a counter, answer the questions the cashier will ask, and pick up their order. | can I get a..., for here or to go?, small / medium / large, anything else?, that's it, name for the order, cream and sugar | Lesson 3 (paying and confirming the total) |
| 5 | A1 | small-talk-basics | How's it going? | The learner can handle the American greeting ritual — including recognizing that "how are you?" is a greeting, not a question about their health — and produce two or three lines of weather-and-weekend small talk. | how's it going?, good, you?, not bad, how was your weekend?, nice weather today, have a good one, take care | Lesson 1 (opening a conversation) |
| 6 | A1 | asking-directions | Excuse me, where's...? | The learner can stop a stranger, ask where something is, and follow a short spoken answer. | excuse me, where's the...?, is it far?, go straight, turn left / right, next to, across from, two blocks | Lesson 2 (asking them to slow down) |
| 7 | A1 | public-transport-and-rideshare | Getting around | The learner can use a bus, train or rideshare: ask which one goes where, confirm the stop, and message a driver. | which bus goes to...?, does this train stop at...?, I'm at the corner of...., I'm running late, pick-up spot, one-way, transfer | Lesson 6 (places and directions) and Lesson 3 (fares) |
| 8 | A1 | shopping-and-checkout | At the store | The learner can find an item, ask about price and payment, and get through a checkout conversation without freezing. | do you have...?, where can I find...?, I'm just looking, paper or plastic?, debit or credit?, receipt, do you have this in...? | Lesson 3 (prices and paying) and Lesson 4 (counter questions) |
| 9 | A1 | basic-health | I don't feel well | The learner can say what hurts, describe feeling unwell in simple terms, and ask for a pharmacy or for help. | I don't feel well, my head / stomach hurts, I have a fever, I need a pharmacy, can you help me?, I'm allergic to..., call a doctor | Lesson 2 (asking for help) and Lesson 6 (finding the place) |
| 10 | A1 | daily-routine | My day | The learner can describe their own typical weekday — times, habits, what they do first and last. | I wake up at..., I go to work, I get home around..., in the morning / at night, on weekends, usually, before / after | Lesson 5 (the weekend question, now answered at length) |
| 11 | A1 | family-and-people | Talking about people | The learner can describe family members, friends and colleagues — who they are, what they do, what they're like. This is where third-person `-s` becomes unavoidable. | my sister / my boyfriend, he works at..., she lives in..., they have two kids, he's really funny, we've known each other since..., older / younger than me | Lesson 1 (the same questions, now about a third person) and Lesson 10 (routine verbs shifted to he/she) |
| 12 | A1 | making-plans | Do you want to grab something? | The learner can invite someone out, propose a time and place, and accept or decline an invitation. | do you want to...?, are you free on Saturday?, how about seven?, sounds good, I can't, I have..., let's meet at..., I'll text you | Lesson 5 (small talk opening into an invitation) and Lesson 10 (days and times) |
| 13 | A2 | past-events-weekend | What did you do last weekend? | The learner can talk about what they did recently using the past simple, and ask others the same. | I went to..., we had dinner at..., did you go...?, I didn't do much, last night / last weekend, it was great, I stayed home | Lesson 12 (the plans they made) and Lesson 10 (routine verbs shifted to the past) |
| 14 | A2 | housing-and-roommates | Finding a place to live | The learner can ask about an apartment, understand what's included, and handle everyday requests with a landlord or roommate. | how much is rent?, are utilities included?, lease, deposit, is the neighborhood safe?, the sink is leaking, can you take out the trash? | Lesson 3 (amounts) and Lesson 6 (neighborhood and location) |
| 15 | A2 | restaurant-full-service | Dinner out | The learner can handle a sit-down restaurant end to end: ordering, modifications, allergies, splitting the check, and tipping. | can we get a table for two?, I'll have the..., can I get that without...?, I'm allergic to..., separate checks, how much should we tip?, could we get the check? | Lesson 4 (ordering) and Lesson 3 (money, now with tip math) |
| 16 | A2 | pharmacy-and-symptoms | At the pharmacy | The learner can describe symptoms to a pharmacist, ask what to take, and understand dosage instructions. | I've had a cough for three days, what do you recommend?, over-the-counter, every four hours, with food, painkiller, prescription | Lesson 9 (body and symptoms) and Lesson 8 (asking a store employee) |
| 17 | A2 | childhood-and-used-to | When I was a kid | The learner can talk about how life used to be and what they used to do, using `used to` and the past simple together. | I used to..., when I was a kid, we would always..., I grew up in..., back then, things were different, my parents used to say | Lesson 13 (past simple) and Lesson 11 (family, now in the past) |
| 18 | A2 | phone-and-messaging | On the phone | The learner can hold a short phone call, leave and understand a voicemail, and handle a bad connection — the hardest listening situation there is, with no lips to read. | can you hear me?, you're breaking up, let me call you back, is this a good time?, leave a message, I'll shoot you a text, hold on a second | Lesson 2 (asking for repetition without visual cues) and Lesson 7 (giving a driver a location by phone) |
| 19 | A2 | feelings-and-small-problems | How I'm actually doing | The learner can say how they really feel — tired, stressed, homesick, excited — and respond when someone else does. | I'm exhausted, I'm stressed out, I miss my family, I'm homesick, that sucks, I'm so happy for you, are you okay? | Lesson 5 (small talk, now going past "good, you?") |
| 20 | A2 | banking-and-bills | Money and paperwork | The learner can open or manage an account, understand a bill, and handle payments and transfers. | checking / savings account, direct deposit, my card was declined, a fee, transfer, due date, autopay | Lesson 3 (amounts) and Lesson 14 (rent and deposits) |
| 21 | A2 | work-basics | Talking about my job | The learner can describe what they do at work, their schedule, and their coworkers, and handle everyday workplace exchanges. | I work as a..., I'm in charge of..., my shift starts at..., I'm off on Fridays, can you cover for me?, my manager, I'm swamped | Lesson 1 (occupation, now expanded) and Lesson 11 (describing colleagues) |
| 22 | A2 | appointments-and-services | Making an appointment | The learner can book, reschedule, or cancel an appointment by phone or in person, and explain what they need. | I'd like to make an appointment, do you have anything on Tuesday?, can I reschedule?, I need to cancel, what time works?, how long does it take? | Lesson 18 (making the call) and Lesson 12 (proposing times) |
| 23 | A2 | clothes-and-sizes | Shopping for clothes | The learner can ask for sizes, try things on, and return or exchange something. | do you have this in a medium?, fitting room, it's too tight / too loose, I'd like to return this, do you have the receipt?, exchange, on sale | Lesson 8 (store interactions) and Lesson 3 (prices and discounts) |
| 24 | A2 | telling-a-story | You won't believe what happened | The learner can tell a short story about something that happened to them, using past continuous and past simple together. | I was walking when..., all of a sudden, I couldn't believe it, luckily, it turned out that..., I was about to..., and then | Lesson 13 (past simple) and Lesson 17 (past habits as background) |
| 25 | B1 | workplace-meetings | In meetings | The learner can participate in a work meeting: give a status update, flag a blocker, and ask for clarification without losing face. | I'm still working on..., I'm blocked on..., just to make sure I understood..., can we circle back to...?, the deadline is..., I'll follow up | Lesson 21 (work vocabulary) and Lesson 2 (clarifying, now in a professional register) |
| 26 | B1 | doctor-visit-detailed | At the doctor | The learner can give a medical history, describe pain precisely, and understand what a doctor tells them to do. | it's a sharp / dull pain, it started three days ago, I'm taking..., do I need a referral?, insurance, follow-up, side effects | Lesson 16 (symptoms) and Lesson 24 (narrating when it started) |
| 27 | B1 | opinions-and-agreement | What I think | The learner can give an opinion, agree, partly disagree, and disagree politely on everyday topics. | I think that..., I'm not sure I agree, that's a good point, but..., it depends, in my experience, I see what you mean, I'd say | Lesson 19 (reactions) and Lesson 12 (negotiating what to do) |
| 28 | B1 | paperwork-and-immigration | Forms, offices and ID | The learner can handle a government office or an official form: explain what they need, spell their information aloud, and ask what's missing. | I'm here to apply for..., what documents do I need?, proof of address, social security number, could you spell that?, appointment confirmation, is this the right line? | Lesson 2 (spelling aloud under pressure) and Lesson 20 (account and ID details) |
| 29 | B1 | complaints-and-customer-service | When something goes wrong | The learner can complain clearly and firmly without being rude, and push for a fix when the first answer is no. | there's a problem with..., I was charged twice, this isn't what I ordered, can I speak to a manager?, I'd like a refund, how long will that take?, that doesn't work for me | Lesson 20 (billing) and Lesson 22 (services that failed) |
| 30 | B1 | giving-advice | If I were you | The learner can give advice and suggest alternatives, using should, could and "if I were you". | you should..., have you tried...?, if I were you, I'd..., it might be worth..., I wouldn't do that, maybe you could..., it's up to you | Lesson 19 (a friend's problem) and Lesson 27 (stating a position) |
| 31 | B1 | small-talk-culture | Reading between the lines | The learner can interpret American indirectness — "we should grab coffee sometime", "that's interesting", "let's circle back" — and use the same softening themselves. | we should ... sometime (rarely a real plan), that's interesting, no worries, I'll let you know, just checking in, sounds great!, to be honest | Lesson 5 (the greeting ritual) and Lesson 27 (softened disagreement) |
| 32 | B1 | hosting-and-social-events | Parties and get-togethers | The learner can host or attend a social gathering: invite people, offer things, contribute, and leave gracefully. | come over, can I bring anything?, help yourself, potluck, make yourself at home, I should get going, thanks for having me | Lesson 12 (invitations) and Lesson 15 (food and sharing) |
| 33 | B1 | hypotheticals | What would you do? | The learner can talk about hypothetical situations, dreams and regrets using conditionals. | if I had more time, I'd..., what would you do if...?, I wish I could..., I would have..., in your shoes, that would be ideal, unless | Lesson 30 (advice as hypothetical) and Lesson 27 (opinions) |
| 34 | B2 | negotiating-at-work | Asking for what you're worth | The learner can negotiate a raise, a deadline, or a workload change, and hold a position under pushback. | I'd like to discuss my compensation, based on my contributions, is there flexibility on...?, I'm not comfortable with..., what if we..., let's find a middle ground | Lesson 25 (workplace register) and Lesson 33 (conditional framing) |
| 35 | B2 | conflict-and-diplomacy | Difficult conversations | The learner can raise a problem with a neighbor, roommate or colleague and de-escalate rather than inflame it. | I wanted to talk about..., I don't want to make this a big deal, but..., from my side it felt like..., can we agree on...?, I hear you, going forward | Lesson 29 (complaining firmly) and Lesson 31 (softening) |
| 36 | B2 | job-interview | The interview | The learner can present their experience and achievements, answer behavioral questions, and ask their own. | tell me about yourself, my background is in..., a challenge I faced was..., I'm looking for..., my strengths, salary expectations, do you have any questions for us? | Lesson 21 (describing the job) and Lesson 34 (compensation) |
| 37 | B2 | emergencies-and-hospital | Emergencies | The learner can handle an emergency room or a 911 call: describe what happened, advocate for themselves or a family member, and deal with insurance. | call 911, he's not breathing, emergency room, what's your insurance?, sign this consent form, admitted, discharged | Lesson 26 (medical detail) and Lesson 24 (narrating what happened) |
| 38 | B2 | culture-identity-and-immigrant-life | Where I'm from | The learner can talk in depth about Paraguay, explain their own culture to Americans, and discuss what it's like to live between two countries. | back home we..., it's hard to explain, people assume that..., I go back once a year, adjusting to..., the biggest difference is..., bilingual | Lesson 17 (childhood) and Lesson 27 (defending a view) |
| 39 | B2 | humor-sarcasm-and-idioms | Getting the joke | The learner can catch sarcasm and common idioms, and tell a joke or tease back without misfiring. | yeah, right (sarcastic), no way!, you're kidding, that's hilarious, I'm just messing with you, it's a long story, that went over my head | Lesson 31 (indirectness) and Lesson 19 (reactions) |
| 40 | B2 | driving-police-and-traffic | Driving and getting pulled over | The learner can deal with a traffic stop, a breakdown, or a minor accident calmly and correctly. | license and registration, I was going the speed limit, my car broke down, I have a flat tire, insurance card, nobody was hurt, can I get a copy of the report? | Lesson 28 (documents at a counter) and Lesson 24 (narrating an incident) |
