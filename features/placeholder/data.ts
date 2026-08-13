/**
 * Every invented value in the app, in one place.
 *
 * The shell, the arena screen, the leaderboard, and the models page were built
 * ahead of the features that produce their data, so all of it is fake. Keeping
 * it in one module makes that reversible rather than a hunt: deleting this
 * folder turns the compiler into the list of everything still fake, because
 * every consumer becomes a type error at once.
 *
 * Nothing outside this file invents data. If a screen needs a number it does
 * not have yet, it comes from here.
 */

export type PlaceholderModel = {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  /** The single letter the sketch puts in a model's badge. */
  readonly initial: string;
  readonly contextTokens: number;
};

export type PlaceholderAnswerState = "streaming" | "done" | "failed";

export type PlaceholderAnswer = {
  readonly modelId: string;
  readonly state: PlaceholderAnswerState;
  readonly text: string;
  readonly firstTokenMs: number | null;
  readonly durationMs: number;
  readonly tokens: number;
  readonly tokensPerSecond: number;
};

export type PlaceholderTurn = {
  readonly id: string;
  readonly prompt: string;
  readonly answers: readonly PlaceholderAnswer[];
  /** Which answer won, if this turn has been voted on. */
  readonly winnerModelId: string | null;
};

export type PlaceholderThread = {
  readonly id: string;
  readonly name: string;
  readonly updatedLabel: string;
};

export type PlaceholderStanding = {
  readonly modelId: string;
  readonly won: number;
  readonly of: number;
  readonly avgFirstTokenMs: number;
  readonly avgTokensPerSecond: number;
};

export const PLACEHOLDER_MODELS: readonly PlaceholderModel[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B Instruct",
    vendor: "Meta",
    initial: "L",
    contextTokens: 131072,
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    name: "Qwen3 235B A22B",
    vendor: "Qwen",
    initial: "Q",
    contextTokens: 262144,
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct:free",
    name: "Mistral Small 3.2 24B",
    vendor: "Mistral",
    initial: "M",
    contextTokens: 96000,
  },
  {
    id: "deepseek/deepseek-r1-0528:free",
    name: "DeepSeek R1",
    vendor: "DeepSeek",
    initial: "D",
    contextTokens: 163840,
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B",
    vendor: "Google",
    initial: "G",
    contextTokens: 96000,
  },
];

export const PLACEHOLDER_SELECTED_MODEL_IDS: readonly string[] = [
  PLACEHOLDER_MODELS[0].id,
  PLACEHOLDER_MODELS[1].id,
  PLACEHOLDER_MODELS[2].id,
];

/**
 * One finished turn and one still running, so the trace can be seen both mid
 * race and frozen, and so a failed card sits next to healthy ones.
 */
export const PLACEHOLDER_TURNS: readonly PlaceholderTurn[] = [
  {
    id: "turn-1",
    prompt: "Explain what a token is to someone who has never used an LLM.",
    winnerModelId: PLACEHOLDER_MODELS[1].id,
    answers: [
      {
        modelId: PLACEHOLDER_MODELS[0].id,
        state: "done",
        text: 'A token is a chunk of text a model reads and writes in. Not quite a word and not quite a letter: common words are usually one token, rarer ones get split into pieces. "Unhelpful" might arrive as "un" and "helpful". Everything a model charges for, remembers, and produces is counted in these chunks rather than in words.',
        firstTokenMs: 412,
        durationMs: 2580,
        tokens: 78,
        tokensPerSecond: 30.2,
      },
      {
        modelId: PLACEHOLDER_MODELS[1].id,
        state: "done",
        text: "Think of a token as the unit a model reads in, the way a reader takes in syllables rather than individual letters. Roughly four characters of English, so a page of text is about five hundred of them. The reason it matters to you: a model's context window, the amount it can hold in mind at once, is measured in tokens, not pages.",
        firstTokenMs: 1183,
        durationMs: 4090,
        tokens: 96,
        tokensPerSecond: 23.5,
      },
      {
        modelId: PLACEHOLDER_MODELS[2].id,
        state: "failed",
        text: "",
        firstTokenMs: 688,
        durationMs: 1840,
        tokens: 0,
        tokensPerSecond: 0,
      },
    ],
  },
  {
    id: "turn-2",
    prompt: "Now say it in one sentence.",
    winnerModelId: null,
    answers: [
      {
        modelId: PLACEHOLDER_MODELS[0].id,
        state: "done",
        text: "A token is the small chunk of text, usually about four characters, that a model actually reads and writes in.",
        firstTokenMs: 388,
        durationMs: 1120,
        tokens: 24,
        tokensPerSecond: 21.4,
      },
      {
        modelId: PLACEHOLDER_MODELS[1].id,
        state: "streaming",
        text: "A token is the unit a model reads and writes in, a few characters long, and it is what",
        firstTokenMs: 902,
        durationMs: 2300,
        tokens: 21,
        tokensPerSecond: 19.8,
      },
      {
        modelId: PLACEHOLDER_MODELS[2].id,
        state: "streaming",
        text: "A token is roughly four characters of text",
        firstTokenMs: 1440,
        durationMs: 2300,
        tokens: 9,
        tokensPerSecond: 12.1,
      },
    ],
  },
];

export const PLACEHOLDER_THREADS: readonly PlaceholderThread[] = [
  { id: "thread-1", name: "Explaining tokens", updatedLabel: "Just now" },
  { id: "thread-2", name: "Rewriting the error copy", updatedLabel: "Tuesday" },
  { id: "thread-3", name: "Regex for ISO dates", updatedLabel: "Last week" },
  { id: "thread-4", name: "Naming the trace component", updatedLabel: "Aug 4" },
];

export const PLACEHOLDER_THREAD_NAME = PLACEHOLDER_THREADS[0].name;

export const PLACEHOLDER_GLOBAL_STANDINGS: readonly PlaceholderStanding[] = [
  {
    modelId: PLACEHOLDER_MODELS[1].id,
    won: 507,
    of: 700,
    avgFirstTokenMs: 1186,
    avgTokensPerSecond: 57,
  },
  {
    modelId: PLACEHOLDER_MODELS[0].id,
    won: 402,
    of: 688,
    avgFirstTokenMs: 640,
    avgTokensPerSecond: 71,
  },
  {
    modelId: PLACEHOLDER_MODELS[3].id,
    won: 288,
    of: 612,
    avgFirstTokenMs: 2140,
    avgTokensPerSecond: 34,
  },
  {
    modelId: PLACEHOLDER_MODELS[2].id,
    won: 190,
    of: 604,
    avgFirstTokenMs: 512,
    avgTokensPerSecond: 88,
  },
  {
    modelId: PLACEHOLDER_MODELS[4].id,
    won: 96,
    of: 430,
    avgFirstTokenMs: 980,
    avgTokensPerSecond: 62,
  },
];

export const PLACEHOLDER_PERSONAL_STANDINGS: readonly PlaceholderStanding[] = [
  {
    modelId: PLACEHOLDER_MODELS[0].id,
    won: 6,
    of: 9,
    avgFirstTokenMs: 705,
    avgTokensPerSecond: 68,
  },
  {
    modelId: PLACEHOLDER_MODELS[1].id,
    won: 3,
    of: 9,
    avgFirstTokenMs: 1204,
    avgTokensPerSecond: 55,
  },
  {
    modelId: PLACEHOLDER_MODELS[2].id,
    won: 0,
    of: 4,
    avgFirstTokenMs: 498,
    avgTokensPerSecond: 90,
  },
];

const MODELS_BY_ID: ReadonlyMap<string, PlaceholderModel> = new Map(
  PLACEHOLDER_MODELS.map((model) => [model.id, model]),
);

export const findPlaceholderModel = (
  modelId: string,
): PlaceholderModel | undefined => MODELS_BY_ID.get(modelId);
