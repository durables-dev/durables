import { RubricView } from "../features/evaluation-report/RubricView";

export function RubricPage() {
  return (
    <>
      <h1>Rubric</h1>
      <p>These are the patterns Durables checks cited lines against. They are the same regular expressions the check runs.</p>
      <RubricView />
    </>
  );
}
