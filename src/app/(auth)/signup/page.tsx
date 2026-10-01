import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next } = await props.searchParams;
  return <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />;
}
