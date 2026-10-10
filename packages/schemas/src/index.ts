// Schemas that both api (request validation) and web (form validation) use.
// One file per resource, re-exported here. Nothing in this package may import
// from api, web, the Workers runtime or the DOM.
export { handleSchema, reservedHandles } from "./handle";
