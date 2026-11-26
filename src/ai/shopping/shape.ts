// Shopping's model answers, read tolerantly as Research's and News' are: an amount as 449.99, "449.99" or "$449.99";
// a part that can't be read becomes null or is left out alone. Code checks everything after (src/domain/shopping/).
import { z } from "zod";

// an amount of money as the model may write it: a number, or a string with a currency sign and thousands' commas
const amount = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const s = v.replace(/[^\d.,]/g, "");
  const n = /,\d{2}$/.test(s) && !s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  return Number(n);
}, z.number().positive().finite());

const quoted = z
  .object({ amount, words: z.string().catch("") })
  .nullable()
  .catch(null);

export const TextPrice = z.object({
  price: quoted.default(null),
  regular: quoted.default(null),
  currency: z.string().catch("").default(""),
});
export type TextPrice = z.infer<typeof TextPrice>;
