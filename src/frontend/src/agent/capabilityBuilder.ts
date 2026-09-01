// FabFlow AI Agent -- ModuleCapability builder PROTOTYPE (Phase A2).
//
// This file is NOT wired into AGENT_ACTIONS, TOOL_CATALOG, runAction(),
// or runQuery() anywhere. It is not imported by anything the running
// Agent actually uses. Its only job is to prove one narrow claim: that
// a small, declarative "capability contract" can be assembled into a
// real AgentAction WITHOUT changing that action's behavior.
//
// Scope, deliberately narrow (per the Phase A2 approval):
//   - The existing AgentAction interface (agent/types.ts) is
//     authoritative and unchanged -- ModuleCapabilityContract below is a
//     field-for-field decomposition of it, not a new interface layered
//     on top.
//   - validate()/execute() are NOT made declarative -- they are carried
//     through by direct reference, not reimplemented. Reimplementing
//     them would risk exactly the behavioral drift this prototype exists
//     to rule out, and would be solving a much bigger problem than
//     "can a contract assemble into an AgentAction" (that bigger problem
//     -- e.g. whether business logic itself can become declarative -- is
//     explicitly NOT this prototype's job).
//   - JsonSchemaProperty is not touched, extended, or redesigned.
//   - recordPayment's actual `parameters` schema (including the
//     filesJson string workaround for the array-type limitation) is
//     carried through unchanged, not "fixed."
//   - Only recordPayment is exercised. No other tool is converted.
//
// What this DOES prove: the assembly step itself (contract -> real
// AgentAction object) is lossless and behavior-preserving.
// What this does NOT prove: that a contract can be hand-authored for a
// brand-new module and produce correct business logic -- that is
// deliberately out of scope here and remains future work.

import type {
  AgentAction,
  AgentActionContext,
  AgentActionOutcome,
  AgentRiskLevel,
  ToolParameterSchema,
} from "./types";

/** The declarative shape a module capability is described by -- every
 * field maps 1:1 to the corresponding AgentAction field. Deliberately
 * generic over TParams exactly like AgentAction itself, not a narrower
 * or looser type. */
export interface ModuleCapabilityContract<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  permission: string;
  riskLevel: AgentRiskLevel;
  kind: "read" | "write";
  destructive: boolean;
  parameters: ToolParameterSchema;
  validate: (params: TParams) => TParams;
  execute: (
    params: TParams,
    ctx: AgentActionContext,
  ) => Promise<AgentActionOutcome>;
}

/** Pure, total assembler: every field of the returned object is exactly
 * the corresponding field of the input contract -- nothing computed,
 * nothing defaulted, nothing dropped. If this function ever needs to
 * "adjust" a field to make the result work, that is a sign the
 * contract shape itself is wrong, not something to paper over here. */
export function buildAgentAction<TParams>(
  contract: ModuleCapabilityContract<TParams>,
): AgentAction<TParams> {
  return {
    name: contract.name,
    description: contract.description,
    permission: contract.permission,
    riskLevel: contract.riskLevel,
    kind: contract.kind,
    destructive: contract.destructive,
    parameters: contract.parameters,
    validate: contract.validate,
    execute: contract.execute,
  };
}

/** Derives a ModuleCapabilityContract FROM an already-existing
 * AgentAction's own fields -- never hand-retyped, so there is no
 * transcription step that could silently drift from the real tool. */
export function contractFromExistingAction<TParams>(
  action: AgentAction<TParams>,
): ModuleCapabilityContract<TParams> {
  return {
    name: action.name,
    description: action.description,
    permission: action.permission,
    riskLevel: action.riskLevel,
    kind: action.kind,
    destructive: action.destructive,
    parameters: action.parameters,
    validate: action.validate,
    execute: action.execute,
  };
}
