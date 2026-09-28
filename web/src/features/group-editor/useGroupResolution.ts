import { useEffect, useRef, useState } from "react";
import { resolveGroup } from "../../api/groups";
import type { GroupProblem, ResolvedGroup } from "../../api/types";

const DEBOUNCE_MS = 300;

export type GroupResolution = {
  /** The editor's text. */
  source: string;
  /** Set from typing. */
  setSource(next: string): void;
  /** The latest resolution that matches `source`, or null before the first one. */
  resolved: ResolvedGroup | null;
  /** Problems to mark: from the latest resolution, or from a refused publish. */
  problems: GroupProblem[];
  setProblems(problems: GroupProblem[]): void;
  /** True while the latest text hasn't been resolved yet. */
  pending: boolean;
  error: string | null;
};

/**
 * Sends the editor's full text to api after each pause in typing, and takes
 * back the file to show. api does all the parsing and merging; the file it
 * returns replaces the editor's text only if nothing was typed meanwhile.
 */
export function useGroupResolution(): GroupResolution {
  const [source, setSourceState] = useState("");
  const [resolved, setResolved] = useState<ResolvedGroup | null>(null);
  const [problems, setProblems] = useState<GroupProblem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(source);

  const setSource = (next: string) => {
    latest.current = next;
    setSourceState(next);
  };

  useEffect(() => {
    if (resolved && source === resolved.file) {
      setPending(false);
      return;
    }
    setPending(true);
    const sent = source;
    const timer = setTimeout(() => {
      resolveGroup(sent)
        .then((result) => {
          if (latest.current !== sent) return; // typed since: a newer request follows
          latest.current = result.file;
          setSourceState(result.file);
          setResolved(result);
          setProblems(result.problems);
          setError(null);
          setPending(false);
        })
        .catch((caught) => {
          if (latest.current !== sent) return;
          setError(caught instanceof Error ? caught.message : String(caught));
          setPending(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

  return { source, setSource, resolved, problems, setProblems, pending, error };
}
