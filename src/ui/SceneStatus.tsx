/**
 * The screen-reader contract: a text description of the branch and its
 * spatial field, operating instructions for pointer and keyboard, and a
 * polite live region for state changes.
 */
import { useWatl } from "../state/store";

export function SceneStatus() {
  const status = useWatl((s) => s.status);
  const finePointer = useWatl((s) => s.finePointer);

  return (
    <>
      <p className="sr-only" id="scene-description">
        WATL is represented by a living Golden Wattle branch. It begins as a young shoot near the lower edge and grows as
        the page is scrolled: it rises with a slight diagonal lean, extends slender lateral twigs, and unfolds long narrow
        green phyllodes. Compact olive buds hang in multi-head axillary strings on fine stems, and open into dense
        spherical yellow pom-poms as their five-part florets separate and hundreds of fine stamens extend. Stars occupy
        several real depths, so turning the branch also changes the surrounding space.
      </p>
      <p className="sr-only" id="keyboard-instructions">
        Use the arrow keys to rotate the branch, plus and minus to zoom, Enter or Space to finish its growth and then
        open every remaining bud, and Home to reset the view.
      </p>
      <p className="sr-only" id="scene-pointer-instructions">
        {finePointer
          ? "Scroll to grow the branch and open its flowers. After maturity, move across the branch to open nearby buds beneath your pointer, or click a bud to open it directly. Drag to orbit."
          : "Scroll to grow the branch and open its flowers. After maturity, tap a bud to open it directly. Drag sideways to orbit."}
      </p>
      <p className="sr-only" id="stage-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </>
  );
}
