import CartRogueGame from "./CartRogueGamePhase13";
import FullscreenPresentation from "./FullscreenPresentation";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export default function Page() {
  return <>
    <ServiceWorkerRegistration />
    <FullscreenPresentation />
    <CartRogueGame />
  </>;
}
