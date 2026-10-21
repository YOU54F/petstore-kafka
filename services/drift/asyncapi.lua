-- Provider states for pets-service.drift.yaml and adoptions-service.drift.yaml. On operation:started this tells the
-- harness (harness.js) which state the operation needs and what its trigger hook (trigger.sh) should do. The fixed ids
-- are the ones the receive cases' payloads use.
local harness = os.getenv("DRIFT_HARNESS_URL") or "http://127.0.0.1:18182"

local states = {
  -- pets-service.drift.yaml
  onPetAdded = { state = "nothing in particular" },
  onPetStatusChanged = { state = "nothing in particular" },
  publishPetAdded_NewPet = { state = "no pet exists", trigger = "add pet" },
  publishPetStatusChanged_NewPet = { state = "no pet exists", trigger = "add pet" },
  publishPetStatusChanged_Patched = { state = "a pet is available", trigger = "patch pet" },
  -- adoptions-service.drift.yaml
  onAdoptionRequested = {
    state = "a pet is available", petId = "5b0c4e0e-6d1a-4f5e-9a51-1f3c2d7e8a01" },
  onAdoptionStatusChanged_Denied = {
    state = "an adoption is available",
    petId = "5b0c4e0e-6d1a-4f5e-9a51-1f3c2d7e8a02", adoptionId = "5b0c4e0e-6d1a-4f5e-9a51-1f3c2d7e8a03" },
  onPetStatusChangedByAnyone = { state = "nothing in particular" },
  publishAdoptionRequested = { state = "a pet is available", trigger = "request adoption" },
  publishAdoptionStatusChanged_Approved = { state = "an adoption is available", trigger = "approve" },
  publishAdoptionStatusChanged_Requested = { state = "a pet is available", trigger = "request adoption" },
  publishPetAdoptionStatusChanged_Adopted = { state = "an adoption is available", trigger = "approve" },
  publishPetAdoptionStatusChanged_OnHold = { state = "a pet is available", trigger = "request adoption" },
  publishPetAdoptionStatusChanged_Released = { state = "an adoption is available", trigger = "deny" },
}

return {
  event_handlers = {
    ["operation:started"] = function(event, data)
      local s = states[data[2]] -- data[2] is the operation name
      if s == nil then
        return
      end
      local res = http({ url = harness .. "/drift/state", method = "POST", body = s })
      if res.status ~= 200 then
        error("provider state '" .. s.state .. "' failed: " .. tostring(res.status) .. " " .. tostring(res.body))
      end
    end,
  },
  exported_functions = {},
}
