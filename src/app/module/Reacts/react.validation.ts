import { z } from "zod";
import { REACTION_TYPES } from "./react.interface";

const setReactionValidationSchema = z.object({
  body: z.object({
    type: z.enum(REACTION_TYPES, {
      errorMap: () => ({
        message: `Reaction type must be one of: ${REACTION_TYPES.join(", ")}`,
      }),
    }),
  }),
});

export const ReactValidation = {
  setReactionValidationSchema,
};
