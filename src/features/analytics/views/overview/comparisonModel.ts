export type ComparisonMetric =
  'requests' | 'tokens' | 'rpm' | 'tpm' | 'cache_rate' | 'cost' | 'processing';

export type ComparisonBand = {
  id: string;
  min: number;
  max: number;
  phraseKey: string;
  phraseDefault: string;
  tooltipKey: string;
  tooltipDefault: string;
  formula: string;
  calculate: (value: number) => number;
};

export type MetricComparison = {
  metric: ComparisonMetric;
  value: number | null;
  phraseKey: string;
  phraseDefault: string;
  tooltipKey: string;
  tooltipDefault: string;
  formula: string;
  calculation: string;
  figure: string;
  available: boolean;
};

export const RESTING_HEARTBEATS_PER_MINUTE = 70;
export const MINUTES_PER_YEAR = 60 * 24 * 365;
export const RESTING_HEARTBEATS_PER_YEAR = RESTING_HEARTBEATS_PER_MINUTE * MINUTES_PER_YEAR;

const band = (
  metric: ComparisonMetric,
  id: string,
  min: number,
  max: number,
  phraseDefault: string,
  tooltipDefault: string,
  formula: string,
  calculate: (value: number) => number
): ComparisonBand => ({
  id,
  min,
  max,
  phraseKey: `analytics.overview.comparison.${metric}.${id}`,
  phraseDefault,
  tooltipKey: `analytics.overview.comparison.${metric}.${id}_hint`,
  tooltipDefault,
  formula,
  calculate,
});

const noValue = (metric: ComparisonMetric): MetricComparison => ({
  metric,
  value: null,
  phraseKey: `analytics.overview.comparison.${metric}.unavailable`,
  phraseDefault: 'No comparison until this metric has measured usage.',
  tooltipKey: `analytics.overview.comparison.${metric}.unavailable_hint`,
  tooltipDefault: 'The selected range does not contain a usable value for this comparison.',
  formula: 'unavailable',
  calculation: 'unavailable',
  figure: '',
  available: false,
});

/**
 * Rounded comparisons are deliberately dimensional rather than accounting claims. The source
 * constants live beside their formulas so a future copy edit cannot silently change the math.
 */
export const COMPARISON_BANDS: Record<ComparisonMetric, readonly ComparisonBand[]> = {
  requests: [
    band(
      'requests',
      'blinks',
      0,
      1,
      'No requests yet.',
      'A request is one proxy request recorded in the selected range.',
      'n = 0',
      () => 0
    ),
    band(
      'requests',
      'seconds_of_blinking',
      1,
      100,
      'About {{value}} seconds of blinking.',
      'People blink about 15 times per minute.',
      'n / 15 × 60 seconds',
      (value) => (value / 15) * 60
    ),
    band(
      'requests',
      'web_pages',
      100,
      1_000,
      'About {{value}} web pages worth of HTTP chatter.',
      'This uses 70 HTTP requests as a rough page-load comparison.',
      'n / 70 requests per page',
      (value) => value / 70
    ),
    band(
      'requests',
      'texter_days',
      1_000,
      10_000,
      "About {{value}} days of an average texter's thumbs.",
      'This treats one request like one text message, at 40 messages per day.',
      'n / 40 messages per day',
      (value) => value / 40
    ),
    band(
      'requests',
      'inbox_workdays',
      10_000,
      100_000,
      'About {{value}} workdays of inbox traffic.',
      'This uses 120 sent or received emails per office workday.',
      'n / 120 emails per workday',
      (value) => value / 120
    ),
    band(
      'requests',
      'stadiums',
      100_000,
      1_000_000,
      'Enough to fill Michigan Stadium {{value}} times.',
      'The comparison uses 107,601 seats, one request per seat.',
      'n / 107,601 seats',
      (value) => value / 107_601
    ),
    band(
      'requests',
      'walking_kilometers',
      1_000_000,
      10_000_000,
      'One step per request means {{value}} km walked.',
      'An average adult stride is about 0.75 meters.',
      'n × 0.75 m / 1,000',
      (value) => (value * 0.75) / 1_000
    ),
    band(
      'requests',
      'heartbeats',
      10_000_000,
      Number.POSITIVE_INFINITY,
      'About {{value}} years of a resting heartbeat.',
      `A calm heart beats ${RESTING_HEARTBEATS_PER_MINUTE} times per minute, or ${RESTING_HEARTBEATS_PER_YEAR.toLocaleString('en-US')} times in a 365-day year.`,
      `n / ${RESTING_HEARTBEATS_PER_YEAR.toLocaleString('en-US')} beats per year`,
      (value) => value / RESTING_HEARTBEATS_PER_YEAR
    ),
  ],
  tokens: [
    band(
      'tokens',
      'paperback_novels',
      0,
      1_000_000,
      'About {{value}} paperback novels.',
      'A 90,000-word novel is roughly 120,000 tokens at 0.75 words per token.',
      't / 120,000 tokens per novel',
      (value) => value / 120_000
    ),
    band(
      'tokens',
      'war_and_peace',
      1_000_000,
      10_000_000,
      'About {{value}} copies of War and Peace.',
      'War and Peace is roughly 783,000 tokens using 587,287 words at 0.75 words per token.',
      't / 783,000 tokens',
      (value) => value / 783_000
    ),
    band(
      'tokens',
      'oxford_dictionary',
      10_000_000,
      100_000_000,
      'About {{value}} complete Oxford English Dictionaries.',
      'One OED second edition is estimated at 21,730 pages × 6,150 characters ÷ 4.',
      't / 33,409,875 tokens',
      (value) => value / 33_409_875
    ),
    band(
      'tokens',
      'audiobook_years',
      100_000_000,
      1_000_000_000,
      'About {{value}} years of nonstop audiobook narration.',
      'Narration is estimated at 150 words per minute and 0.75 words per token.',
      't × 0.75 / 150 / 525,600',
      (value) => (value * 0.75) / 150 / 525_600
    ),
    band(
      'tokens',
      'novels_per_hour',
      1_000_000_000,
      10_000_000_000,
      'A novel every hour for {{value}} years straight.',
      'This compares one 120,000-token novel with every hour in a Julian year.',
      't / (8,766 × 120,000)',
      (value) => value / (8_766 * 120_000)
    ),
    band(
      'tokens',
      'wikipedia',
      10_000_000_000,
      100_000_000_000,
      'About {{value}}× the text of English Wikipedia.',
      'English Wikipedia article prose is estimated at about 6.5 billion tokens.',
      't / 6,500,000,000 tokens',
      (value) => value / 6_500_000_000
    ),
    band(
      'tokens',
      'everest',
      100_000_000_000,
      1_000_000_000_000,
      'Printed and stacked, that is {{value}}× the height of Everest.',
      'A 500-word page is estimated at 0.1 mm of paper, compared with Everest at 8.849 km.',
      't × 1.5e-10 km / 8.849 km',
      (value) => (value * 1.5e-10) / 8.849
    ),
    band(
      'tokens',
      'karman_line',
      1_000_000_000_000,
      Number.POSITIVE_INFINITY,
      'That paper stack clears the Kármán line {{value}}× over.',
      'A trillion tokens is estimated at a 150 km paper stack; space starts at 100 km.',
      't × 1.5e-10 km / 100 km',
      (value) => (value * 1.5e-10) / 100
    ),
  ],
  rpm: [
    band(
      'rpm',
      'minute_hand',
      0,
      1,
      "About {{value}}× the speed of a clock's minute hand.",
      'The minute hand turns once per hour, or about 0.01667 RPM.',
      'r / 0.01667 RPM',
      (value) => value / 0.01667
    ),
    band(
      'rpm',
      'lp',
      1,
      33.333,
      'About {{value}}% of a 33⅓ RPM LP.',
      'A 33⅓ RPM record is the slower vinyl reference point.',
      'r / 33.333 × 100',
      (value) => (value / 33.333) * 100
    ),
    band(
      'rpm',
      'single',
      33.333,
      78,
      'Cruising at about {{value}}× a 45 RPM single.',
      'A 45 RPM jukebox single is the reference for this band.',
      'r / 45 RPM',
      (value) => value / 45
    ),
    band(
      'rpm',
      'shellac',
      78,
      394,
      'About {{value}}× a 78 RPM shellac record.',
      '78 RPM was a common pre-vinyl record speed.',
      'r / 78 RPM',
      (value) => value / 78
    ),
    band(
      'rpm',
      'helicopter_rotor',
      394,
      800,
      'Helicopter rotor territory, about {{value}}× a Bell 206 rotor.',
      'A Bell 206 main rotor turns at roughly 394 RPM in flight.',
      'r / 394 RPM',
      (value) => value / 394
    ),
    band(
      'rpm',
      'engine_idle',
      800,
      3_180,
      "Revving at about {{value}}× a car engine's idle.",
      'Most petrol engines idle near 800 RPM.',
      'r / 800 RPM',
      (value) => value / 800
    ),
    band(
      'rpm',
      'hummingbird',
      3_180,
      7_200,
      "About {{value}}× a hummingbird's wingbeat.",
      'A ruby-throated hummingbird beats its wings about 3,180 times per minute.',
      'r / 3,180 RPM',
      (value) => value / 3_180
    ),
    band(
      'rpm',
      'hard_drive',
      7_200,
      15_000,
      'About {{value}}× a hard-drive platter.',
      '7,200 RPM is a familiar desktop hard-drive speed.',
      'r / 7,200 RPM',
      (value) => value / 7_200
    ),
    band(
      'rpm',
      'formula_one',
      15_000,
      Number.POSITIVE_INFINITY,
      'Past F1 redline, at about {{value}}× a 15,000 RPM engine.',
      'Modern Formula 1 power units are rev-limited to 15,000 RPM.',
      'r / 15,000 RPM',
      (value) => value / 15_000
    ),
  ],
  tpm: [
    band(
      'tpm',
      'typist',
      0,
      53,
      'About {{value}}% of an office typist.',
      'A 40-word-per-minute typist produces roughly 53 tokens per minute.',
      'p / 53.3 × 100',
      (value) => (value / 53.3) * 100
    ),
    band(
      'tpm',
      'conversation',
      53,
      200,
      'About {{value}}% of ordinary conversation.',
      'Casual speech runs around 150 words per minute, or about 200 tokens per minute.',
      'p / 200 × 100',
      (value) => (value / 200) * 100
    ),
    band(
      'tpm',
      'speaking',
      200,
      320,
      'About {{value}}× a person talking out loud.',
      'This uses 200 tokens per minute as the conversation reference.',
      'p / 200 TPM',
      (value) => value / 200
    ),
    band(
      'tpm',
      'reading',
      320,
      517,
      'About {{value}}× the speed you read this page.',
      'Adult silent reading is estimated at 240 words per minute, or about 320 tokens.',
      'p / 320 TPM',
      (value) => value / 320
    ),
    band(
      'tpm',
      'rap_god',
      517,
      6_670,
      'About {{value}}× the fastest verse in Rap God.',
      'The comparison uses roughly 517 tokens per minute for the record-setting passage.',
      'p / 517 TPM',
      (value) => value / 517
    ),
    band(
      'tpm',
      'paperback_pages',
      6_670,
      120_000,
      'About {{value}} paperback pages every minute.',
      'A typeset trade-paperback page is estimated at roughly 667 tokens.',
      'p / 667 tokens per page',
      (value) => value / 667
    ),
    band(
      'tpm',
      'novels',
      120_000,
      783_000,
      'About {{value}} complete novels per minute.',
      'One 90,000-word novel is roughly 120,000 tokens.',
      'p / 120,000 tokens per novel',
      (value) => value / 120_000
    ),
    band(
      'tpm',
      'war_and_peace',
      783_000,
      33_409_875,
      'About {{value}}× War and Peace per minute.',
      'War and Peace is roughly 783,000 tokens using the shared token estimate.',
      'p / 783,000 TPM',
      (value) => value / 783_000
    ),
    band(
      'tpm',
      'oxford_dictionary',
      33_409_875,
      Number.POSITIVE_INFINITY,
      'About {{value}} Oxford English Dictionaries a minute.',
      'One OED second edition is estimated at 33,409,875 tokens.',
      'p / 33,409,875 TPM',
      (value) => value / 33_409_875
    ),
  ],
  cache_rate: [
    band(
      'cache_rate',
      'cold_start',
      0,
      0.1,
      'Almost no input tokens were reused.',
      'Fewer than 0.1% of input tokens were read from cache in this range.',
      'c < 0.1%',
      (value) => value
    ),
    band(
      'cache_rate',
      'one_in',
      0.1,
      15,
      'About 1 input token in {{value}} hits cache.',
      'Long, stable prompt prefixes are what make this rate climb.',
      '100 / c',
      (value) => 100 / value
    ),
    band(
      'cache_rate',
      'batting',
      15,
      30,
      'Batting .{{value}}, respectable in the majors.',
      'The number is the cache rate expressed as a three-digit batting average.',
      'round(c × 10)',
      (value) => Math.round(value * 10)
    ),
    band(
      'cache_rate',
      'nba_range',
      30,
      50,
      'Three-point range, about {{value}}% cached.',
      'NBA three-point shooting is a loose 36% comparison for this band.',
      'c',
      (value) => value
    ),
    band(
      'cache_rate',
      'coin_flip',
      50,
      65,
      'Better than a coin flip, {{value}}% of input tokens rerun from cache.',
      'More than half of the input token volume was served from cache.',
      'c',
      (value) => value
    ),
    band(
      'cache_rate',
      'free_throw',
      65,
      80,
      'Free-throw form, around {{value}}% cached.',
      'The NBA free-throw average is a loose 78% production comparison.',
      'c',
      (value) => value
    ),
    band(
      'cache_rate',
      'battery_cap',
      80,
      90,
      '{{value}}% cached, right around a phone battery longevity cap.',
      'Phone makers often choose an 80% charge cap to reduce battery wear.',
      'c',
      (value) => value
    ),
    band(
      'cache_rate',
      'full_freight',
      90,
      99,
      'About 1 in {{value}} input tokens is uncached.',
      'At this rate, the uncached share is 100 minus c percent.',
      '100 / (100 - c)',
      (value) => 100 / (100 - value)
    ),
    band(
      'cache_rate',
      'near_total',
      99,
      100,
      '{{value}}% cached, near-total recall.',
      'Almost every input token is being reused in this illustrative range.',
      'c',
      (value) => value
    ),
    band(
      'cache_rate',
      'total',
      100,
      Number.POSITIVE_INFINITY,
      '100% cached, near-total recall.',
      'Every measured input token was served from cache.',
      'c',
      (value) => value
    ),
  ],
  cost: [
    band(
      'cost',
      'stamps',
      0,
      1,
      'About {{value}} postage stamps.',
      'A US Forever stamp is used as a rounded 0.78 USD comparison.',
      'd / 0.78 USD',
      (value) => value / 0.78
    ),
    band(
      'cost',
      'latte',
      1,
      5,
      'About {{value}}% of a coffee-shop latte.',
      'A medium latte is rounded to 5 USD.',
      'd / 5 × 100',
      (value) => (value / 5) * 100
    ),
    band(
      'cost',
      'movie_tickets',
      5,
      18,
      'About {{value}} movie tickets.',
      'An average US cinema ticket is rounded to 12 USD.',
      'd / 12 USD',
      (value) => value / 12
    ),
    band(
      'cost',
      'streaming',
      18,
      200,
      'About {{value}} months of a streaming subscription.',
      'A standard ad-free streaming plan is rounded to 18 USD per month.',
      'd / 18 USD',
      (value) => value / 18
    ),
    band(
      'cost',
      'ai_plan',
      200,
      1_000,
      'About {{value}} months on a top-tier AI plan.',
      'A consumer AI plan is rounded to 200 USD per month.',
      'd / 200 USD',
      (value) => value / 200
    ),
    band(
      'cost',
      'laptops',
      1_000,
      48_000,
      'About {{value}} base-model laptops.',
      'A base-model 13-inch laptop is rounded to 999 USD.',
      'd / 999 USD',
      (value) => value / 999
    ),
    band(
      'cost',
      'cars',
      48_000,
      1_000_000,
      'About {{value}} brand-new cars.',
      'A new vehicle transaction is rounded to 48,000 USD.',
      'd / 48,000 USD',
      (value) => value / 48_000
    ),
    band(
      'cost',
      'super_bowl',
      1_000_000,
      70_000_000,
      'About {{value}} seconds of Super Bowl airtime.',
      'A 30-second Super Bowl spot is rounded to 8 million USD.',
      'd / 266,667 USD per second',
      (value) => value / 266_667
    ),
    band(
      'cost',
      'falcon_launches',
      70_000_000,
      Number.POSITIVE_INFINITY,
      'About {{value}} Falcon 9 launches.',
      'A Falcon 9 list price is rounded to 70 million USD.',
      'd / 70,000,000 USD',
      (value) => value / 70_000_000
    ),
  ],
  processing: [
    band(
      'processing',
      'blinks',
      0,
      1,
      'About {{value}} blinks of an eye.',
      'A human blink is roughly 100 milliseconds.',
      's / 0.1 seconds',
      (value) => value / 0.1
    ),
    band(
      'processing',
      'commercials',
      1,
      60,
      'About {{value}} TV commercials.',
      'The standard broadcast spot is rounded to 30 seconds.',
      's / 30 seconds',
      (value) => value / 30
    ),
    band(
      'processing',
      'songs',
      60,
      3_600,
      'About {{value}} average pop songs.',
      'An average pop song is rounded to 210 seconds.',
      's / 210 seconds',
      (value) => value / 210
    ),
    band(
      'processing',
      'films',
      3_600,
      86_400,
      'About {{value}} feature films, back to back.',
      'A typical modern feature is rounded to 7,800 seconds.',
      's / 7,800 seconds',
      (value) => value / 7_800
    ),
    band(
      'processing',
      'iss_orbits',
      86_400,
      1_209_600,
      'About {{value}} orbits of Earth aboard the ISS.',
      'The ISS circles Earth in roughly 5,574 seconds.',
      's / 5,574 seconds',
      (value) => value / 5_574
    ),
    band(
      'processing',
      'work_weeks',
      1_209_600,
      31_557_600,
      'About {{value}} full-time work weeks.',
      'A 40-hour work week is rounded to 144,000 seconds.',
      's / 144,000 seconds',
      (value) => value / 144_000
    ),
    band(
      'processing',
      'years',
      31_557_600,
      315_576_000,
      'About {{value}} trips around the Sun.',
      'One Julian year is 31,557,600 seconds.',
      's / 31,557,600 seconds',
      (value) => value / 31_557_600
    ),
    band(
      'processing',
      'careers',
      315_576_000,
      Number.POSITIVE_INFINITY,
      'About {{value}} entire working careers.',
      'A 40-year career at 2,000 hours per year is rounded to 288 million seconds.',
      's / 288,000,000 seconds',
      (value) => value / 288_000_000
    ),
  ],
};

const comparisonFigure = (value: number, locale = 'en') => {
  if (!Number.isFinite(value)) return '';
  const hasDecimal = Math.abs(value) < 10;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: hasDecimal ? 1 : 0,
  }).format(value);
};

const comparisonVariables: Record<ComparisonMetric, string> = {
  requests: 'n',
  tokens: 't',
  rpm: 'r',
  tpm: 'p',
  cache_rate: 'c',
  cost: 'd',
  processing: 's',
};

const comparisonInput = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);

function comparisonCalculation(
  metric: ComparisonMetric,
  band: ComparisonBand,
  value: number,
  figure: string,
  locale: string
) {
  const variable = comparisonVariables[metric];
  const expression = band.formula.replace(
    new RegExp(`\\b${variable}\\b`, 'g'),
    comparisonInput(value, locale)
  );
  return `${expression} = ${figure}`;
}

export function comparisonBand(metric: ComparisonMetric, value: number): ComparisonBand | null {
  if (!Number.isFinite(value)) return null;
  return COMPARISON_BANDS[metric].find(({ min, max }) => value >= min && value < max) ?? null;
}

export function buildComparison(
  metric: ComparisonMetric,
  value: number | null | undefined,
  locale = 'en'
): MetricComparison {
  if (value === null || value === undefined || !Number.isFinite(value)) return noValue(metric);
  const selected = comparisonBand(metric, value);
  if (!selected) return noValue(metric);
  const figure = comparisonFigure(selected.calculate(value), locale);
  return {
    metric,
    value,
    phraseKey: selected.phraseKey,
    phraseDefault: selected.phraseDefault,
    tooltipKey: selected.tooltipKey,
    tooltipDefault: selected.tooltipDefault,
    formula: selected.formula,
    figure,
    calculation: comparisonCalculation(metric, selected, value, figure, locale),
    available: true,
  };
}

export function comparisonBandCounts() {
  return Object.fromEntries(
    Object.entries(COMPARISON_BANDS).map(([metric, bands]) => [metric, bands.length])
  ) as Record<ComparisonMetric, number>;
}
