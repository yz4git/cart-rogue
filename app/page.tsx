import CartRogueGame from "./CartRogueGame";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export default function Page() {
  return <>
    <ServiceWorkerRegistration />
    <CartRogueGame />
  </>;
}
