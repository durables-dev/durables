import { useNavigate } from "react-router";
import { Panel } from "../components/Panel";
import { GroupEditor } from "../features/group-editor/GroupEditor";

/** Steps 6–7: build a group from pasted addresses and publish it. */
export function GroupEditorPage() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Build a group</h1>
      <Panel step={6} title="Paste activity addresses">
        <GroupEditor onPublished={(result) => navigate(`/${result.owner}/groups/${result.name}@${result.version}`)} />
      </Panel>
    </>
  );
}
