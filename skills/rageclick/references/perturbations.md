# Five operation templates

Use a successful baseline, a disposable state, and an explicit observable contract. Apply only the templates relevant to the goal. The counts and delays below are defaults, not claims about realistic user populations.

| Template | Sequence | Possible objective invariant |
| --- | --- | --- |
| Rapid clicks | Fill valid input; click the same screen coordinate 3 times with a 60 ms pause between clicks; wait for completion. | One submission intent produces one record. |
| Back and re-enter | Edit a saved draft; follow an in-app link; use browser Back; inspect the draft. | A promised saved draft survives navigation. |
| Invalid file then retry | Upload a synthetic unsupported file; confirm rejection; choose a valid file; submit again. | Rejection does not poison the next valid attempt. |
| Refresh in progress | Edit a draft or start a safely repeatable operation; refresh; inspect the durable state. | A promised save or completed transaction is preserved. |
| Delayed request and retry | Delay only the known same-origin mutation endpoint by 800 ms; submit; retry while pending; settle. | A retry does not create duplicate records or show stale results. |

`rapid-click` uses `page.mouse.click` at the initially observed center. It neither dispatches synthetic DOM events nor forces a disabled control. A disabled button therefore receives no click handler. If layout changes move the target, the screenshot and trace expose that; inspect before interpreting results.

For an interrupted transaction, distinguish a persisted server operation from a lost UI acknowledgement. A final screenshot alone does not prove whether two database writes occurred. Use a rendered record count, an authorized read endpoint, or existing server evidence to establish the invariant. The demo's record list comes from its session-scoped server API.

Start with two attempts, retain both outcomes, and keep retries bounded (at most 5 clicks per burst). Stop if the environment ceases to be disposable or authorization becomes uncertain. A template that has no applicable promise is `not tested`, not a pass.
