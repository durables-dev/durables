import { Markdown } from "../../components/Markdown";

export function ListingReadme({ readme }: { readme: string }) {
  return <Markdown>{readme}</Markdown>;
}
