import { useLiveUpdate } from '@disguise-one/vue-liveupdate'

export const liveUpdate = useLiveUpdate(window.location.host, { updateFrequencyMs: 1000 })
