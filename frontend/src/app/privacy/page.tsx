import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Privacy | CampusPool" };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-mist [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Your data" title="Privacy" intro="Plain-language answers about what CampusPool keeps, who can see it, and how to take it back." />

      <Block title="What we keep">
        <p>
          Your <strong>Thapar email</strong> (to sign you in), your <strong>name, branch, year and hostel</strong>, an optional <strong>phone number</strong>, <strong>UPI ID</strong> and
          <strong> profile photo</strong>, the <strong>rides and activities</strong> you post or join, your <strong>requests, payment records</strong> (who says they paid whom, never any money), your{" "}
          <strong>messages and chat photos</strong>, notifications, and any reports or feedback you send.
        </p>
        <p>
          One cookie keeps you signed in. There are no advertising or analytics trackers in this app.
        </p>
      </Block>

      <Block title="Who can see what">
        <p>
          <strong>Other students</strong> see your name and photo, plus your year, branch and hostel only if you leave those switched on in Settings. They never see your email or phone number.
          Your UPI ID is shown only to riders who owe you a fare share.
        </p>
        <p>
          <strong>Chats</strong> can be read only by the two people in them. Blocking and restricting stay private: the other student is not told.
        </p>
        <p>
          <strong>Administrators</strong> can see account names and emails, reports and feedback so they can moderate the app. The admin screens do not show chat messages or chat photos.
        </p>
      </Block>

      <Block title="How chats are protected">
        <p>
          Chats are <strong>end-to-end encrypted</strong>. Your browser makes a key pair. Messages and photos are locked on your device before they are sent, and only you and the person you are talking to can
          unlock them. The server stores scrambled data it cannot read, and it is scrambled a second time at rest.
        </p>
        <p>
          Your <strong>private key stays on your devices</strong>, in the browser, so you never type a passphrase to read messages. To use chat on a new device, you approve it from one you already use by typing the
          short code the new device shows; the key then travels sealed between your two devices. Your key stays in the browser after you sign out, so use <strong>Settings &gt; Secure chat &gt; Sign out and remove chat
          keys</strong> on a shared computer.
        </p>
        <p>
          You can also create a <strong>recovery key</strong>. It is shown once and never sent to us; a copy of your chat key locked with it is stored so you can get back in if you lose every device. Nobody, including
          CampusPool, can recover your messages without one of your devices or that key. Compare the security code in a chat with the other person to be sure nobody is in the middle.
        </p>
        <p>
          <strong>Stickers</strong> are built in and need nothing from outside. <strong>GIF search</strong>, when switched on, is provided by GIPHY: what you type there goes to GIPHY, and opening a GIF lets GIPHY see your
          IP address, as with any picture on the web. The GIF you chose is still sent inside the encrypted message. GIFs sent from your own device are encrypted like photos and never touch GIPHY. While you type, the
          other person may see &ldquo;typing&rdquo;; the server sees that you are typing, never what.
        </p>
        <p>What the server can still see: who talks to whom, when, roughly how long each message is, and that a photo was sent. It cannot see the words, photos, stickers, GIFs or reactions.</p>
        <p>
          Because moderators cannot read chats, a report can include the last 10 messages <strong>only if the person reporting chooses to share them</strong>. Messages sent before secure chat was introduced are not
          end-to-end encrypted; they are marked &ldquo;Sent before secure chat&rdquo; and are deleted with the 90-day cleanup. Use HTTPS when the site is deployed.
        </p>
      </Block>

      <Block title="Maps and routes">
        <p>
          Map tiles are loaded from OpenStreetMap, and road routes from an OpenStreetMap routing service. Your browser contacts them directly, so they can see your network address and the area you view, and the route
          lookup sends the two map points. Ride map points are stored with the ride and shown to other students. You can post a ride without map points.
        </p>
      </Block>

      <Block title="Ratings and reminders">
        <p>
          After a completed ride, riders rate the creator and the creator rates each rider. Others see only the average and count. Written comments are shown only to the person rated, without your name, and ratings
          are kept even after the ride is removed. Reminders use your email address only if you switch email reminders on.
        </p>
      </Block>

      <Block title="How long things are kept">
        <ul className="list-disc space-y-1 pl-5">
          <li>Activities are removed about 2 hours after they start; rides that never finished about 12 hours after departure.</li>
          <li>Finished rides are kept until every fare share is confirmed, then removed about a day later. You can also remove them yourself once settled.</li>
          <li>Chat messages and chat photos are deleted after 90 days. Notifications after 30 days.</li>
          <li>You can remove finished rides and activities from your own lists at any time.</li>
        </ul>
      </Block>

      <Block title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>Change what others see in Settings, under Privacy.</li>
          <li>Download your data as a file from Settings.</li>
          <li>Delete your account in Settings. It removes your profile, photo, posts and messages. It is blocked while ride payments are unsettled, so nobody is left owed money without a record.</li>
        </ul>
      </Block>

      <p className="text-xs text-mist">
        This page describes how the app behaves today. It is not legal advice, and it should be reviewed by whoever runs CampusPool before it is opened to the public.
      </p>
    </div>
  );
}
