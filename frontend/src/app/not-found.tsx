import { StatusPage } from "@/components/errors/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="This page doesn't exist"
      description="The link may be broken, or the page may have moved. Check the URL, or head back to safety."
      actionHref="/"
      actionLabel="Go home"
    />
  );
}
