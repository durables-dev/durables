// Schemas that both api (request validation) and web (form validation) use.
// One file per resource, re-exported here. Nothing in this package may import
// from api, web, the Workers runtime or the DOM.
export {
  checkHandleRule,
  handleAvailableMessage,
  handleEmptyMessage,
  handleFormatMessage,
  handleFormatSchema,
  handleInvalidMessage,
  handlePattern,
  handleSchema,
  handleTakenMessage,
  isReservedHandle,
  reservedHandles,
  type HandleRuleResult,
} from "./handle";
