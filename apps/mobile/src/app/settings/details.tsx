import { Redirect } from 'expo-router';

/**
 * Release A, A9 (docs/ux/MEMBER-APP-MAP.md): one profile editor. "Your details" (name, mobile, goal,
 * experience, age, height) joined Edit profile (photo, name, bio, link) on one page, "Your profile",
 * which the Profile's pencil and Settings → Your profile both open. An old link lands there.
 */
export default function DetailsRedirect() {
  return <Redirect href="/edit-profile" />;
}