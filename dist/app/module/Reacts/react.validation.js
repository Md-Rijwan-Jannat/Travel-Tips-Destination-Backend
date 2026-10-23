"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactValidation = void 0;
const zod_1 = require("zod");
const react_interface_1 = require("./react.interface");
const setReactionValidationSchema = zod_1.z.object({
    body: zod_1.z.object({
        type: zod_1.z.enum(react_interface_1.REACTION_TYPES, {
            errorMap: () => ({
                message: `Reaction type must be one of: ${react_interface_1.REACTION_TYPES.join(", ")}`,
            }),
        }),
    }),
});
exports.ReactValidation = {
    setReactionValidationSchema,
};
