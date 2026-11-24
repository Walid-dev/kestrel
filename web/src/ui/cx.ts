// Class names joined, the empty ones left out, so a part can add a class on a condition without stray spaces or the
// word "false" in the page: cx("card", wide && "card-wide") is "card" or "card card-wide".
export const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
