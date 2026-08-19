# AOE Retarget Telegraph

The raid hitbox rules are unchanged. This pass only makes intentional target motion visibly different from a final lock.

## Visual language

- **TRACKING / RE-AIM:** magenta. The footprint pulses while its coordinates or heading are still changing.
- **RETARGET:** a bounded three-quarter targeting ring appears on the real hitbox position. The gap in the ring makes heading changes visible.
- **LOCKED:** red. Once movement stops the footprint settles with a short red confirmation pulse.
- **IMMINENT:** amber.
- **FIRED:** white.

The presentation never interpolates the displayed footprint away from the actual gameplay hitbox. This avoids a visually smooth but mechanically dishonest warning.

## Performance contract

- fixed four retarget FX slots, matching the existing four hazard slots
- no textures
- no particles or per-frame mesh allocation
- no additional gameplay entities
- no changes to raid collision, damage, dodge windows, or Hard Mode pressure
