// One player's headshot, used everywhere a player token appears. When we have a
// Wikimedia Commons photo it renders that, cropped to the circular frame the
// parent token provides. Players without a free photo (and any image that fails
// to load) fall back to a neutral silhouette, so a token always looks complete.

import { useState } from "react";
import "./avatar.css";

interface Props {
  photo?: string | null;
  name: string;
}

function Silhouette() {
  return (
    <svg className="pavatar-sil" viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="15.5" r="7" fill="rgba(246,244,239,0.82)" />
      <path d="M7 39 a13 13 0 0 1 26 0 Z" fill="rgba(246,244,239,0.82)" />
    </svg>
  );
}

export function PlayerAvatar({ photo, name }: Props) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return <Silhouette />;
  return (
    <img
      className="pavatar-img"
      src={photo}
      alt={name}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
