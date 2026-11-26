# Official LGD State & UT Code Verification Record

- **Verification Source:** Local Government Directory (LGD), Ministry of Panchayati Raj, Government of India — https://lgdirectory.gov.in/
- **Verification Date:** `2026-11-26`
- **Branch:** `feat/state-code-invitation-menu`
- **Coverage:** All `36` active Indian States and Union Territories configured in [indianStates.ts](../src/lib/constants/indianStates.ts) and [stateCatalog.ts](../src/lib/constants/stateCatalog.ts) (`0` unverified active entries).
- **Retired / Merged LGD Codes:** `025` (Daman & Diu) and `026` (Dadra & Nagar Haveli) merged into LGD code `38` (`038` — Dadra and Nagar Haveli and Daman and Diu).

> **Security Boundary:** These 3-digit zero-padded LGD numeric codes (`001`–`038`) are strictly informational UI metadata for the State Code Invitation modal and convenience navigation. They MUST NEVER grant authentication, approve registration, bypass email OTP, or authorize state scopes.

| LGD Code (2-digit) | Informational Display (3-digit) | ISO / App Prefix | Canonical State / Union Territory |
| --- | --- | --- | --- |
| `01` | `001` | `JK` | Jammu and Kashmir |
| `02` | `002` | `HP` | Himachal Pradesh |
| `03` | `003` | `PB` | Punjab |
| `04` | `004` | `CH` | Chandigarh |
| `05` | `005` | `UK` | Uttarakhand |
| `06` | `006` | `HR` | Haryana |
| `07` | `007` | `DL` | Delhi |
| `08` | `008` | `RJ` | Rajasthan |
| `09` | `009` | `UP` | Uttar Pradesh |
| `10` | `010` | `BR` | Bihar |
| `11` | `011` | `SK` | Sikkim |
| `12` | `012` | `AR` | Arunachal Pradesh |
| `13` | `013` | `NL` | Nagaland |
| `14` | `014` | `MN` | Manipur |
| `15` | `015` | `MZ` | Mizoram |
| `16` | `016` | `TR` | Tripura |
| `17` | `017` | `ML` | Meghalaya |
| `18` | `018` | `AS` | Assam |
| `19` | `019` | `WB` | West Bengal |
| `20` | `020` | `JH` | Jharkhand |
| `21` | `021` | `OD` | Odisha |
| `22` | `022` | `CG` | Chhattisgarh |
| `23` | `023` | `MP` | Madhya Pradesh |
| `24` | `024` | `GJ` | Gujarat |
| `27` | `027` | `MH` | Maharashtra |
| `28` | `028` | `AP` | Andhra Pradesh |
| `29` | `029` | `KA` | Karnataka |
| `30` | `030` | `GA` | Goa |
| `31` | `031` | `LD` | Lakshadweep |
| `32` | `032` | `KL` | Kerala |
| `33` | `033` | `TN` | Tamil Nadu |
| `34` | `034` | `PY` | Puducherry |
| `35` | `035` | `AN` | Andaman and Nicobar Islands |
| `36` | `036` | `TS` | Telangana |
| `37` | `037` | `LA` | Ladakh |
| `38` | `038` | `DD` | Dadra and Nagar Haveli and Daman and Diu |
