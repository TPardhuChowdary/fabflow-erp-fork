import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Migration module: handles dropping `accessControlState` from the previous version.
// The old canister had an authorization extension that stored accessControlState.
// The new canister removes it; this explicit migration consumes and discards it.
module {
  // Old UserRole type from the authorization extension
  type OldUserRole = { #admin; #user; #guest };

  // Old AccessControlState type (from authorization/access-control.mo)
  type OldAccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, OldUserRole>;
  };

  // Domain: the old stable fields that need to be consumed
  type OldActor = {
    accessControlState : OldAccessControlState;
  };

  // Codomain: empty — no new fields produced by this migration
  type NewActor = {};

  // Consume accessControlState and discard it; all other stable fields
  // are inherited automatically by the runtime.
  public func run(_old : OldActor) : NewActor {
    {};
  };
};
