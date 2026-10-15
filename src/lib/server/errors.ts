import { z } from "zod";
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please retry.",
) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Check the entered values.";
  if (error instanceof Error) {
    if (/NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/.test(error.message))
      throw error;
    if (/fetch failed|network|timeout|ECONN/.test(error.message))
      return "Connection interrupted. Check your internet and retry.";
    if (
      /relation .* does not exist|schema cache|PGRST20|function .* does not exist/i.test(
        error.message,
      )
    )
      return "The hosted database needs setup. Follow the web setup guide.";
    if (/row.level|permission denied|42501/i.test(error.message))
      return "You do not have permission for this action.";
    if (/duplicate key|unique constraint/i.test(error.message))
      return "This request or record already exists. Refresh before retrying.";
    if (
      error.message.length < 200 &&
      !/sql|constraint|postgres|jwt|secret|token|stack/i.test(error.message)
    )
      return error.message;
  }
  return fallback;
}
export function checked<T>({
  data,
  error,
}: {
  data: T;
  error: { message: string } | null;
}): T {
  if (error) throw new Error(error.message);
  return data;
}
