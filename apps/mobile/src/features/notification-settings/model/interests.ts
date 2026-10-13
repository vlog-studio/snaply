/**
 * The interest tags an earlier build offered, kept on the device only.
 *
 * Superseded: the interests a user chooses now are the account's, chosen from
 * the server's topics on `/settings/interests` (`features/choose-interests`,
 * spec ACC-5). Nothing reads these tags any more, and they are not uploaded —
 * they stay so a store persisted by that build still loads.
 */
export const INTEREST_OPTIONS = ['여행', '일상', '카페', '맛집', '감성'] as const;
