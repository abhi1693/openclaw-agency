"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";
import { Activity, MessageSquare, Pencil, Settings, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { TaskBoard } from "@/components/organisms/TaskBoard";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiBaseUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

type Board = {
  id: string;
  name: string;
  slug: string;
  board_type?: string;
  objective?: string | null;
  success_metrics?: Record<string, unknown> | null;
  target_date?: string | null;
  goal_confirmed?: boolean;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_at?: string | null;
  assigned_agent_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approvalsCount?: number;
  approvalsPendingCount?: number;
};

type Agent = {
  id: string;
  name: string;
  status: string;
  board_id?: string | null;
  is_board_lead?: boolean;
  updated_at?: string | null;
  last_seen_at?: string | null;
  identity_profile?: {
    emoji?: string | null;
  } | null;
};

type TaskComment = {
  id: string;
  message?: string | null;
  agent_id?: string | null;
  task_id?: string | null;
  created_at: string;
};

type Approval = {
  id: string;
  action_type: string;
  payload?: Record<string, unknown> | null;
  confidence: number;
  rubric_scores?: Record<string, number> | null;
  status: string;
  created_at: string;
  resolved_at?: string | null;
};

type BoardChatMessage = {
  id: string;
  content: string;
  tags?: string[] | null;
  source?: string | null;
  created_at: string;
};

const apiBase = getApiBaseUrl();

const approvalTaskId = (approval: Approval) => {
  const payload = approval.payload ?? {};
  return (
    (payload as Record<string, unknown>).task_id ??
    (payload as Record<string, unknown>).taskId ??
    (payload as Record<string, unknown>).taskID
  );
};

const priorities = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const statusOptions = [
  { value: "inbox", label: "Inbox" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const EMOJI_GLYPHS: Record<string, string> = {
  ":gear:": "⚙️",
  ":sparkles:": "✨",
  ":rocket:": "🚀",
  ":megaphone:": "📣",
  ":chart_with_upwards_trend:": "📈",
  ":bulb:": "💡",
  ":wrench:": "🔧",
  ":shield:": "🛡️",
  ":memo:": "📝",
  ":brain:": "🧠",
};

export default function BoardDetailPage() {
  const router = useRouter();
  const params = useParams();
  const boardIdParam = params?.boardId;
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const { getToken, isSignedIn } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [liveFeed, setLiveFeed] = useState<TaskComment[]>([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [postCommentError, setPostCommentError] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  const approvalsRef = useRef<Approval[]>([]);
  const agentsRef = useRef<Agent[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isApprovalsLoading, setIsApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [approvalsUpdatingId, setApprovalsUpdatingId] = useState<string | null>(
    null,
  );
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<BoardChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatMessagesRef = useRef<BoardChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState(false);
  const pushLiveFeed = useCallback((comment: TaskComment) => {
    setLiveFeed((prev) => {
      if (prev.some((item) => item.id === comment.id)) {
        return prev;
      }
      const next = [comment, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("inbox");
  const [editPriority, setEditPriority] = useState("medium");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [saveTaskError, setSaveTaskError] = useState<string | null>(null);

  const titleLabel = useMemo(
    () => (board ? `${board.name} board` : "Board"),
    [board],
  );

  const latestTaskTimestamp = (items: Task[]) => {
    let latestTime = 0;
    items.forEach((task) => {
      const value = task.updated_at ?? task.created_at;
      if (!value) return;
      const time = new Date(value).getTime();
      if (!Number.isNaN(time) && time > latestTime) {
        latestTime = time;
      }
    });
    return latestTime ? new Date(latestTime).toISOString() : null;
  };

  const latestApprovalTimestamp = (items: Approval[]) => {
    let latestTime = 0;
    items.forEach((approval) => {
      const value = approval.resolved_at ?? approval.created_at;
      if (!value) return;
      const time = new Date(value).getTime();
      if (!Number.isNaN(time) && time > latestTime) {
        latestTime = time;
      }
    });
    return latestTime ? new Date(latestTime).toISOString() : null;
  };

  const latestAgentTimestamp = (items: Agent[]) => {
    let latestTime = 0;
    items.forEach((agent) => {
      const value = agent.updated_at ?? agent.last_seen_at;
      if (!value) return;
      const time = new Date(value).getTime();
      if (!Number.isNaN(time) && time > latestTime) {
        latestTime = time;
      }
    });
    return latestTime ? new Date(latestTime).toISOString() : null;
  };

  const loadBoard = async () => {
    if (!isSignedIn || !boardId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [boardResponse, tasksResponse, agentsResponse] = await Promise.all([
        fetch(`${apiBase}/api/v1/boards/${boardId}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        }),
        fetch(`${apiBase}/api/v1/boards/${boardId}/tasks`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        }),
        fetch(`${apiBase}/api/v1/agents`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        }),
      ]);

      if (!boardResponse.ok) {
        throw new Error("Unable to load board.");
      }
      if (!tasksResponse.ok) {
        throw new Error("Unable to load tasks.");
      }
      if (!agentsResponse.ok) {
        throw new Error("Unable to load agents.");
      }

      const boardData = (await boardResponse.json()) as Board;
      const taskData = (await tasksResponse.json()) as Task[];
      const agentData = (await agentsResponse.json()) as Agent[];
      setBoard(boardData);
      setTasks(taskData);
      setAgents(agentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, isSignedIn]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    approvalsRef.current = approvals;
  }, [approvals]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    if (!isChatOpen) return;
    const timeout = window.setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [chatMessages, isChatOpen]);

  const loadApprovals = useCallback(async () => {
    if (!isSignedIn || !boardId) return;
    setIsApprovalsLoading(true);
    setApprovalsError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/approvals`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to load approvals.");
      }
      const data = (await response.json()) as Approval[];
      setApprovals(data);
    } catch (err) {
      setApprovalsError(
        err instanceof Error ? err.message : "Unable to load approvals.",
      );
    } finally {
      setIsApprovalsLoading(false);
    }
  }, [boardId, getToken, isSignedIn]);

  useEffect(() => {
    loadApprovals();
  }, [boardId, isSignedIn, loadApprovals]);

  const loadBoardChat = useCallback(async () => {
    if (!isSignedIn || !boardId) return;
    setChatError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/memory?limit=200`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to load board chat.");
      }
      const data = (await response.json()) as BoardChatMessage[];
      const chatOnly = data.filter((item) => item.tags?.includes("chat"));
      const ordered = chatOnly.sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return aTime - bTime;
      });
      setChatMessages(ordered);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Unable to load board chat.",
      );
    }
  }, [boardId, getToken, isSignedIn]);

  useEffect(() => {
    loadBoardChat();
  }, [boardId, isSignedIn, loadBoardChat]);

  const latestChatTimestamp = (items: BoardChatMessage[]) => {
    if (!items.length) return undefined;
    const latest = items.reduce((max, item) => {
      const ts = new Date(item.created_at).getTime();
      return Number.isNaN(ts) ? max : Math.max(max, ts);
    }, 0);
    if (!latest) return undefined;
    return new Date(latest).toISOString();
  };

  useEffect(() => {
    if (!isSignedIn || !boardId) return;
    let isCancelled = false;
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || isCancelled) return;
        const url = new URL(
          `${apiBase}/api/v1/boards/${boardId}/memory/stream`,
        );
        const since = latestChatTimestamp(chatMessagesRef.current);
        if (since) {
          url.searchParams.set("since", since);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect board chat stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "memory" && data) {
              try {
                const payload = JSON.parse(data) as { memory?: BoardChatMessage };
                if (payload.memory?.tags?.includes("chat")) {
                  setChatMessages((prev) => {
                    const exists = prev.some(
                      (item) => item.id === payload.memory?.id,
                    );
                    if (exists) return prev;
                    const next = [...prev, payload.memory as BoardChatMessage];
                    next.sort((a, b) => {
                      const aTime = new Date(a.created_at).getTime();
                      const bTime = new Date(b.created_at).getTime();
                      return aTime - bTime;
                    });
                    return next;
                  });
                }
              } catch {
                // ignore malformed
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (!isCancelled) {
          setTimeout(connect, 3000);
        }
      }
    };

    connect();
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [boardId, getToken, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !boardId) return;
    let isCancelled = false;
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || isCancelled) return;
        const url = new URL(
          `${apiBase}/api/v1/boards/${boardId}/approvals/stream`,
        );
        const since = latestApprovalTimestamp(approvalsRef.current);
        if (since) {
          url.searchParams.set("since", since);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect approvals stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "approval" && data) {
              try {
                const payload = JSON.parse(data) as { approval?: Approval };
                if (payload.approval) {
                  setApprovals((prev) => {
                    const index = prev.findIndex(
                      (item) => item.id === payload.approval?.id,
                    );
                    if (index === -1) {
                      return [payload.approval as Approval, ...prev];
                    }
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      ...(payload.approval as Approval),
                    };
                    return next;
                  });
                }
              } catch {
                // Ignore malformed payloads.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (!isCancelled) {
          setTimeout(connect, 3000);
        }
      }
    };

    connect();
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [boardId, getToken, isSignedIn]);

  useEffect(() => {
    if (!selectedTask) {
      setEditTitle("");
      setEditDescription("");
      setEditStatus("inbox");
      setEditPriority("medium");
      setEditAssigneeId("");
      setSaveTaskError(null);
      return;
    }
    setEditTitle(selectedTask.title);
    setEditDescription(selectedTask.description ?? "");
    setEditStatus(selectedTask.status);
    setEditPriority(selectedTask.priority);
    setEditAssigneeId(selectedTask.assigned_agent_id ?? "");
    setSaveTaskError(null);
  }, [selectedTask]);

  useEffect(() => {
    if (!isSignedIn || !boardId || !board) return;
    let isCancelled = false;
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || isCancelled) return;
        const url = new URL(`${apiBase}/api/v1/boards/${boardId}/tasks/stream`);
        const since = latestTaskTimestamp(tasksRef.current);
        if (since) {
          url.searchParams.set("since", since);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect task stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "task" && data) {
              try {
                const payload = JSON.parse(data) as {
                  type?: string;
                  task?: Task;
                  comment?: TaskComment;
                };
                if (payload.comment?.task_id && payload.type === "task.comment") {
                  pushLiveFeed(payload.comment as TaskComment);
                  setComments((prev) => {
                    if (selectedTask?.id !== payload.comment?.task_id) {
                      return prev;
                    }
                    const exists = prev.some((item) => item.id === payload.comment?.id);
                    if (exists) {
                      return prev;
                    }
                    return [...prev, payload.comment as TaskComment];
                  });
                } else if (payload.task) {
                  setTasks((prev) => {
                    const index = prev.findIndex((item) => item.id === payload.task?.id);
                    if (index === -1) {
                      return [payload.task as Task, ...prev];
                    }
                    const next = [...prev];
                    next[index] = { ...next[index], ...(payload.task as Task) };
                    return next;
                  });
                }
              } catch {
                // Ignore malformed payloads.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (!isCancelled) {
          setTimeout(connect, 3000);
        }
      }
    };

    connect();
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [board, boardId, getToken, isSignedIn, selectedTask?.id, pushLiveFeed]);

  useEffect(() => {
    if (!isSignedIn || !boardId) return;
    let isCancelled = false;
    const abortController = new AbortController();

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || isCancelled) return;
        const url = new URL(`${apiBase}/api/v1/agents/stream`);
        url.searchParams.set("board_id", boardId);
        const since = latestAgentTimestamp(agentsRef.current);
        if (since) {
          url.searchParams.set("since", since);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Unable to connect agent stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "agent" && data) {
              try {
                const payload = JSON.parse(data) as { agent?: Agent };
                if (payload.agent) {
                  setAgents((prev) => {
                    const index = prev.findIndex(
                      (item) => item.id === payload.agent?.id,
                    );
                    if (index === -1) {
                      return [payload.agent as Agent, ...prev];
                    }
                    const next = [...prev];
                    next[index] = {
                      ...next[index],
                      ...(payload.agent as Agent),
                    };
                    return next;
                  });
                }
              } catch {
                // Ignore malformed payloads.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        if (!isCancelled) {
          setTimeout(connect, 3000);
        }
      }
    };

    connect();
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [boardId, getToken, isSignedIn]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setCreateError(null);
  };

  const handleCreateTask = async () => {
    if (!isSignedIn || !boardId) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError("Add a task title to continue.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/boards/${boardId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          title: trimmed,
          description: description.trim() || null,
          status: "inbox",
          priority,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create task.");
      }

      const created = (await response.json()) as Task;
      setTasks((prev) => [created, ...prev]);
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendChat = async () => {
    if (!isSignedIn || !boardId) return;
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    setIsChatSending(true);
    setChatError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/memory`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({
            content: trimmed,
            tags: ["chat"],
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to send message.");
      }
      const created = (await response.json()) as BoardChatMessage;
      if (created.tags?.includes("chat")) {
        setChatMessages((prev) => {
          const exists = prev.some((item) => item.id === created.id);
          if (exists) return prev;
          const next = [...prev, created];
          next.sort((a, b) => {
            const aTime = new Date(a.created_at).getTime();
            const bTime = new Date(b.created_at).getTime();
            return aTime - bTime;
          });
          return next;
        });
      }
      setChatInput("");
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Unable to send message.",
      );
    } finally {
      setIsChatSending(false);
    }
  };

  const assigneeById = useMemo(() => {
    const map = new Map<string, string>();
    agents
      .filter((agent) => !boardId || agent.board_id === boardId)
      .forEach((agent) => {
        map.set(agent.id, agent.name);
      });
    return map;
  }, [agents, boardId]);

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      map.set(task.id, task.title);
    });
    return map;
  }, [tasks]);

  const orderedLiveFeed = useMemo(() => {
    return [...liveFeed].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  }, [liveFeed]);

  const pendingApprovalsByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    approvals
      .filter((approval) => approval.status === "pending")
      .forEach((approval) => {
        const taskId = approvalTaskId(approval);
        if (!taskId || typeof taskId !== "string") return;
        map.set(taskId, (map.get(taskId) ?? 0) + 1);
      });
    return map;
  }, [approvals]);

  const totalApprovalsByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    approvals.forEach((approval) => {
      const taskId = approvalTaskId(approval);
      if (!taskId || typeof taskId !== "string") return;
      map.set(taskId, (map.get(taskId) ?? 0) + 1);
    });
    return map;
  }, [approvals]);

  const displayTasks = useMemo(
    () =>
      tasks.map((task) => ({
        ...task,
        assignee: task.assigned_agent_id
          ? assigneeById.get(task.assigned_agent_id)
          : undefined,
        approvalsCount: totalApprovalsByTaskId.get(task.id) ?? 0,
        approvalsPendingCount: pendingApprovalsByTaskId.get(task.id) ?? 0,
      })),
    [tasks, assigneeById, pendingApprovalsByTaskId, totalApprovalsByTaskId],
  );

  const boardAgents = useMemo(
    () => agents.filter((agent) => !boardId || agent.board_id === boardId),
    [agents, boardId],
  );

  const assignableAgents = useMemo(
    () => boardAgents.filter((agent) => !agent.is_board_lead),
    [boardAgents],
  );

  const hasTaskChanges = useMemo(() => {
    if (!selectedTask) return false;
    const normalizedTitle = editTitle.trim();
    const normalizedDescription = editDescription.trim();
    const currentDescription = (selectedTask.description ?? "").trim();
    const currentAssignee = selectedTask.assigned_agent_id ?? "";
    return (
      normalizedTitle !== selectedTask.title ||
      normalizedDescription !== currentDescription ||
      editStatus !== selectedTask.status ||
      editPriority !== selectedTask.priority ||
      editAssigneeId !== currentAssignee
    );
  }, [
    editAssigneeId,
    editDescription,
    editPriority,
    editStatus,
    editTitle,
    selectedTask,
  ]);

  const orderedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  }, [comments]);

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "pending"),
    [approvals],
  );

  const taskApprovals = useMemo(() => {
    if (!selectedTask) return [];
    const taskId = selectedTask.id;
    return approvals.filter((approval) => {
      const payloadTaskId = approvalTaskId(approval);
      return payloadTaskId === taskId;
    });
  }, [approvals, selectedTask]);

  const workingAgentIds = useMemo(() => {
    const working = new Set<string>();
    tasks.forEach((task) => {
      if (task.status === "in_progress" && task.assigned_agent_id) {
        working.add(task.assigned_agent_id);
      }
    });
    return working;
  }, [tasks]);

  const sortedAgents = useMemo(() => {
    const rank = (agent: Agent) => {
      if (workingAgentIds.has(agent.id)) return 0;
      if (agent.status === "online") return 1;
      if (agent.status === "provisioning") return 2;
      return 3;
    };
    return [...boardAgents].sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }, [boardAgents, workingAgentIds]);

  const loadComments = async (taskId: string) => {
    if (!isSignedIn || !boardId) return;
    setIsCommentsLoading(true);
    setCommentsError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/tasks/${taskId}/comments`,
        {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to load comments.");
      }
      const data = (await response.json()) as TaskComment[];
      setComments(data);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsCommentsLoading(false);
    }
  };

  const openComments = (task: Task) => {
    setIsChatOpen(false);
    setIsLiveFeedOpen(false);
    setSelectedTask(task);
    setIsDetailOpen(true);
    void loadComments(task.id);
  };

  const closeComments = () => {
    setIsDetailOpen(false);
    setSelectedTask(null);
    setComments([]);
    setCommentsError(null);
    setNewComment("");
    setPostCommentError(null);
    setIsEditDialogOpen(false);
  };

  const openBoardChat = () => {
    if (isDetailOpen) {
      closeComments();
    }
    setIsLiveFeedOpen(false);
    setIsChatOpen(true);
  };

  const closeBoardChat = () => {
    setIsChatOpen(false);
    setChatError(null);
  };

  const openLiveFeed = () => {
    if (isDetailOpen) {
      closeComments();
    }
    if (isChatOpen) {
      closeBoardChat();
    }
    setIsLiveFeedOpen(true);
  };

  const closeLiveFeed = () => {
    setIsLiveFeedOpen(false);
  };

  const handlePostComment = async () => {
    if (!selectedTask || !boardId || !isSignedIn) return;
    const trimmed = newComment.trim();
    if (!trimmed) {
      setPostCommentError("Write a message before sending.");
      return;
    }
    setIsPostingComment(true);
    setPostCommentError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/tasks/${selectedTask.id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ message: trimmed }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to send message.");
      }
      const created = (await response.json()) as TaskComment;
      setComments((prev) => [created, ...prev]);
      setNewComment("");
    } catch (err) {
      setPostCommentError(
        err instanceof Error ? err.message : "Unable to send message.",
      );
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleTaskSave = async (closeOnSuccess = false) => {
    if (!selectedTask || !isSignedIn || !boardId) return;
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      setSaveTaskError("Title is required.");
      return;
    }
    setIsSavingTask(true);
    setSaveTaskError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/tasks/${selectedTask.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({
            title: trimmedTitle,
            description: editDescription.trim() || null,
            status: editStatus,
            priority: editPriority,
            assigned_agent_id: editAssigneeId || null,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to update task.");
      }
      const updated = (await response.json()) as Task;
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? updated : task)),
      );
      setSelectedTask(updated);
      if (closeOnSuccess) {
        setIsEditDialogOpen(false);
      }
    } catch (err) {
      setSaveTaskError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleTaskReset = () => {
    if (!selectedTask) return;
    setEditTitle(selectedTask.title);
    setEditDescription(selectedTask.description ?? "");
    setEditStatus(selectedTask.status);
    setEditPriority(selectedTask.priority);
    setEditAssigneeId(selectedTask.assigned_agent_id ?? "");
    setSaveTaskError(null);
  };

  const handleDeleteTask = async () => {
    if (!selectedTask || !boardId || !isSignedIn) return;
    setIsDeletingTask(true);
    setDeleteTaskError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/tasks/${selectedTask.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        },
      );
      if (!response.ok) {
        throw new Error("Unable to delete task.");
      }
      setTasks((prev) => prev.filter((task) => task.id !== selectedTask.id));
      setIsDeleteDialogOpen(false);
      closeComments();
    } catch (err) {
      setDeleteTaskError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleTaskMove = async (taskId: string, status: string) => {
    if (!isSignedIn || !boardId) return;
    const currentTask = tasksRef.current.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === status) return;
    const previousTasks = tasksRef.current;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              assigned_agent_id:
                status === "inbox" ? null : task.assigned_agent_id,
            }
          : task,
      ),
    );
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiBase}/api/v1/boards/${boardId}/tasks/${taskId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to move task.");
      }
      const updated = (await response.json()) as Task;
      setTasks((prev) =>
        prev.map((task) => (task.id === updated.id ? updated : task)),
      );
    } catch (err) {
      setTasks(previousTasks);
      setError(err instanceof Error ? err.message : "Unable to move task.");
    }
  };

  const agentInitials = (agent: Agent) =>
    agent.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  const resolveEmoji = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (EMOJI_GLYPHS[trimmed]) return EMOJI_GLYPHS[trimmed];
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return null;
    return trimmed;
  };

  const agentAvatarLabel = (agent: Agent) => {
    if (agent.is_board_lead) return "⚙️";
    const emoji = resolveEmoji(agent.identity_profile?.emoji ?? null);
    return emoji ?? agentInitials(agent);
  };

  const agentStatusLabel = (agent: Agent) => {
    if (workingAgentIds.has(agent.id)) return "Working";
    if (agent.status === "online") return "Active";
    if (agent.status === "provisioning") return "Provisioning";
    return "Offline";
  };

  const formatCommentTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTaskTimestamp = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusBadgeClass = (value?: string) => {
    switch (value) {
      case "in_progress":
        return "bg-purple-100 text-purple-700";
      case "review":
        return "bg-indigo-100 text-indigo-700";
      case "done":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const priorityBadgeClass = (value?: string) => {
    switch (value?.toLowerCase()) {
      case "high":
        return "bg-rose-100 text-rose-700";
      case "medium":
        return "bg-amber-100 text-amber-700";
      case "low":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const formatApprovalTimestamp = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const humanizeApprovalAction = (value: string) =>
    value
      .split(".")
      .map((part) =>
        part
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase())
      )
      .join(" · ");

  const approvalPayloadValue = (
    payload: Approval["payload"],
    key: string,
  ) => {
    if (!payload) return null;
    const value = payload[key as keyof typeof payload];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    return null;
  };

  const approvalRows = (approval: Approval) => {
    const payload = approval.payload ?? {};
    const taskId =
      approvalPayloadValue(payload, "task_id") ??
      approvalPayloadValue(payload, "taskId") ??
      approvalPayloadValue(payload, "taskID");
    const assignedAgentId =
      approvalPayloadValue(payload, "assigned_agent_id") ??
      approvalPayloadValue(payload, "assignedAgentId");
    const title = approvalPayloadValue(payload, "title");
    const role = approvalPayloadValue(payload, "role");
    const isAssign = approval.action_type.includes("assign");
    const rows: Array<{ label: string; value: string }> = [];
    if (taskId) rows.push({ label: "Task", value: taskId });
    if (isAssign) {
      rows.push({
        label: "Assignee",
        value: assignedAgentId ?? "Unassigned",
      });
    }
    if (title) rows.push({ label: "Title", value: title });
    if (role) rows.push({ label: "Role", value: role });
    return rows;
  };

  const approvalReason = (approval: Approval) =>
    approvalPayloadValue(approval.payload ?? {}, "reason");

  const handleApprovalDecision = useCallback(
    async (approvalId: string, status: "approved" | "rejected") => {
      if (!isSignedIn || !boardId) return;
      setApprovalsUpdatingId(approvalId);
      setApprovalsError(null);
      try {
        const token = await getToken();
        const response = await fetch(
          `${apiBase}/api/v1/boards/${boardId}/approvals/${approvalId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: token ? `Bearer ${token}` : "",
            },
            body: JSON.stringify({ status }),
          },
        );
        if (!response.ok) {
          throw new Error("Unable to update approval.");
        }
        const updated = (await response.json()) as Approval;
        setApprovals((prev) =>
          prev.map((item) => (item.id === approvalId ? updated : item)),
        );
      } catch (err) {
        setApprovalsError(
          err instanceof Error ? err.message : "Unable to update approval.",
        );
      } finally {
        setApprovalsUpdatingId(null);
      }
    },
    [boardId, getToken, isSignedIn],
  );

  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view boards.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/boards"
            signUpForceRedirectUrl="/boards"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
            <div className="px-8 py-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span>{board?.name ?? "Board"}</span>
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold text-slate-900 tracking-tight">
                    {board?.name ?? "Board"}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Keep tasks moving through your workflow.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        viewMode === "board"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                      )}
                      onClick={() => setViewMode("board")}
                    >
                      Board
                    </button>
                    <button
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        viewMode === "list"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                      )}
                      onClick={() => setViewMode("list")}
                    >
                      List
                    </button>
                  </div>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    New task
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/boards/${boardId}/approvals`)}
                    className="relative"
                  >
                    Approvals
                    {pendingApprovals.length > 0 ? (
                      <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                        {pendingApprovals.length}
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openBoardChat}
                    className="h-9 w-9 p-0"
                    aria-label="Board chat"
                    title="Board chat"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openLiveFeed}
                    className="h-9 w-9 p-0"
                    aria-label="Live feed"
                    title="Live feed"
                  >
                    <Activity className="h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => router.push(`/boards/${boardId}/edit`)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    aria-label="Board settings"
                    title="Board settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex gap-6 p-6">
            <aside className="flex h-full w-64 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Agents
                  </p>
                  <p className="text-xs text-slate-400">
                    {sortedAgents.length} total
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/agents/new")}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Add
                </button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {sortedAgents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                    No agents assigned yet.
                  </div>
                ) : (
                  sortedAgents.map((agent) => {
                    const isWorking = workingAgentIds.has(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50",
                        )}
                        onClick={() => router.push(`/agents/${agent.id}`)}
                      >
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {agentAvatarLabel(agent)}
                          <span
                            className={cn(
                              "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white",
                              isWorking
                                ? "bg-emerald-500"
                                : agent.status === "online"
                                  ? "bg-green-500"
                                  : "bg-slate-300",
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {agent.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {agentStatusLabel(agent)}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-6">
              {error && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
                  Loading {titleLabel}…
                </div>
              ) : (
                <>
                  {viewMode === "board" ? (
                    <TaskBoard
                      tasks={displayTasks}
                      onTaskSelect={openComments}
                      onTaskMove={handleTaskMove}
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 px-5 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              All tasks
                            </p>
                            <p className="text-xs text-slate-500">
                              {displayTasks.length} tasks in this board
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsDialogOpen(true)}
                            disabled={isCreating}
                          >
                            New task
                          </Button>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {displayTasks.length === 0 ? (
                          <div className="px-5 py-8 text-sm text-slate-500">
                            No tasks yet. Create your first task to get started.
                          </div>
                        ) : (
                          displayTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className="w-full px-5 py-4 text-left transition hover:bg-slate-50"
                              onClick={() => openComments(task)}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {task.title}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {task.description
                                      ? task.description
                                          .toString()
                                          .trim()
                                          .slice(0, 120)
                                      : "No description"}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                  {task.approvalsPendingCount ? (
                                    <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                      Approval needed · {task.approvalsPendingCount}
                                    </span>
                                  ) : null}
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                      statusBadgeClass(task.status),
                                    )}
                                  >
                                    {task.status.replace(/_/g, " ")}
                                  </span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                      priorityBadgeClass(task.priority),
                                    )}
                                  >
                                    {task.priority}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {task.assignee ?? "Unassigned"}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {formatTaskTimestamp(
                                      task.updated_at ?? task.created_at,
                                    )}
                                  </span>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </SignedIn>
      {isDetailOpen || isChatOpen || isLiveFeedOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20"
          onClick={() => {
            if (isChatOpen) {
              closeBoardChat();
            } else if (isLiveFeedOpen) {
              closeLiveFeed();
            } else {
              closeComments();
            }
          }}
        />
      ) : null}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[760px] max-w-[99vw] transform bg-white shadow-2xl transition-transform",
          isDetailOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Task detail
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {selectedTask?.title ?? "Task"}
                </p>
              </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditDialogOpen(true)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                disabled={!selectedTask}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={closeComments}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </p>
              {selectedTask?.description ? (
                <div className="prose prose-sm max-w-none text-slate-700">
                  <ReactMarkdown
                    components={{
                      p: ({ ...props }) => (
                        <p className="mb-3 last:mb-0" {...props} />
                      ),
                      ul: ({ ...props }) => (
                        <ul className="mb-3 list-disc pl-5" {...props} />
                      ),
                      ol: ({ ...props }) => (
                        <ol className="mb-3 list-decimal pl-5" {...props} />
                      ),
                      li: ({ ...props }) => (
                        <li className="mb-1" {...props} />
                      ),
                      strong: ({ ...props }) => (
                        <strong className="font-semibold" {...props} />
                      ),
                      h1: ({ ...props }) => (
                        <h1 className="mb-2 text-base font-semibold" {...props} />
                      ),
                      h2: ({ ...props }) => (
                        <h2 className="mb-2 text-sm font-semibold" {...props} />
                      ),
                      h3: ({ ...props }) => (
                        <h3 className="mb-2 text-sm font-semibold" {...props} />
                      ),
                      code: ({ ...props }) => (
                        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs" {...props} />
                      ),
                      pre: ({ ...props }) => (
                        <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100" {...props} />
                      ),
                    }}
                  >
                    {selectedTask.description}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No description provided.</p>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Approvals
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/boards/${boardId}/approvals`)}
                >
                  View all
                </Button>
              </div>
              {approvalsError ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  {approvalsError}
                </div>
              ) : isApprovalsLoading ? (
                <p className="text-sm text-slate-500">Loading approvals…</p>
              ) : taskApprovals.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No approvals tied to this task.{" "}
                  {pendingApprovals.length > 0
                    ? `${pendingApprovals.length} pending on this board.`
                    : "No pending approvals on this board."}
                </p>
              ) : (
                <div className="space-y-3">
                  {taskApprovals.map((approval) => (
                    <div
                      key={approval.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-slate-500">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            {humanizeApprovalAction(approval.action_type)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Requested {formatApprovalTimestamp(approval.created_at)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">
                          {approval.confidence}% confidence · {approval.status}
                        </span>
                      </div>
                      {approvalRows(approval).length > 0 ? (
                        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          {approvalRows(approval).map((row) => (
                            <div key={`${approval.id}-${row.label}`}>
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                {row.label}
                              </p>
                              <p className="mt-1 text-xs text-slate-700">
                                {row.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {approvalReason(approval) ? (
                        <p className="mt-2 text-xs text-slate-600">
                          {approvalReason(approval)}
                        </p>
                      ) : null}
                      {approval.status === "pending" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleApprovalDecision(approval.id, "approved")
                            }
                            disabled={approvalsUpdatingId === approval.id}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleApprovalDecision(approval.id, "rejected")
                            }
                            disabled={approvalsUpdatingId === approval.id}
                            className="border-slate-300 text-slate-700"
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Comments
              </p>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Textarea
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  placeholder="Write a message for the assigned agent…"
                  className="min-h-[80px] bg-white"
                />
                {postCommentError ? (
                  <p className="text-xs text-rose-600">{postCommentError}</p>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handlePostComment}
                    disabled={isPostingComment || !newComment.trim()}
                  >
                    {isPostingComment ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </div>
              {isCommentsLoading ? (
                <p className="text-sm text-slate-500">Loading comments…</p>
              ) : commentsError ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  {commentsError}
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-slate-500">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {orderedComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {comment.agent_id
                            ? assigneeById.get(comment.agent_id) ?? "Agent"
                            : "Admin"}
                        </span>
                        <span>{formatCommentTimestamp(comment.created_at)}</span>
                      </div>
                      {comment.message?.trim() ? (
                        <div className="mt-2 text-sm text-slate-900 whitespace-pre-wrap break-words">
                          <ReactMarkdown
                            components={{
                              p: ({ ...props }) => (
                                <p
                                  className="text-sm text-slate-900 whitespace-pre-wrap break-words"
                                  {...props}
                                />
                              ),
                              ul: ({ ...props }) => (
                                <ul
                                  className="list-disc pl-5 text-sm text-slate-900 whitespace-pre-wrap break-words"
                                  {...props}
                                />
                              ),
                              li: ({ ...props }) => (
                                <li
                                  className="mb-1 text-sm text-slate-900 whitespace-pre-wrap break-words"
                                  {...props}
                                />
                              ),
                              strong: ({ ...props }) => (
                                <strong
                                  className="font-semibold text-slate-900"
                                  {...props}
                                />
                              ),
                            }}
                          >
                            {comment.message}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-900">—</p>
                      )}
                      </>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[560px] max-w-[96vw] transform border-l border-slate-200 bg-white shadow-2xl transition-transform",
          isChatOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Board chat
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                Talk to the lead agent. Tag others with @name.
              </p>
            </div>
            <button
              type="button"
              onClick={closeBoardChat}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              aria-label="Close board chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
            <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
              {chatError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {chatError}
                </div>
              ) : null}
              {chatMessages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No messages yet. Start the conversation with your lead agent.
                </p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {message.source ?? "User"}
                      </p>
                      <span className="text-xs text-slate-400">
                        {formatTaskTimestamp(message.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-900">
                      <ReactMarkdown
                        components={{
                          p: ({ ...props }) => (
                            <p className="mb-2 last:mb-0" {...props} />
                          ),
                          ul: ({ ...props }) => (
                            <ul className="mb-2 list-disc pl-5" {...props} />
                          ),
                          ol: ({ ...props }) => (
                            <ol className="mb-2 list-decimal pl-5" {...props} />
                          ),
                          strong: ({ ...props }) => (
                            <strong className="font-semibold" {...props} />
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-4 space-y-2">
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (event.nativeEvent.isComposing) return;
                  if (event.shiftKey) return;
                  event.preventDefault();
                  if (isChatSending) return;
                  if (!chatInput.trim()) return;
                  void handleSendChat();
                }}
                placeholder="Message the board lead. Tag agents with @name."
                className="min-h-[120px]"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSendChat}
                  disabled={isChatSending || !chatInput.trim()}
                >
                  {isChatSending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-[520px] max-w-[96vw] transform border-l border-slate-200 bg-white shadow-2xl transition-transform",
          isLiveFeedOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Live feed
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                Realtime task comments across this board.
              </p>
            </div>
            <button
              type="button"
              onClick={closeLiveFeed}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
              aria-label="Close live feed"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {orderedLiveFeed.length === 0 ? (
              <p className="text-sm text-slate-500">
                Waiting for new comments…
              </p>
            ) : (
              <div className="space-y-3">
                {orderedLiveFeed.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3 text-xs text-slate-500">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-700">
                          {comment.task_id
                            ? taskTitleById.get(comment.task_id) ?? "Task"
                            : "Task"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {comment.agent_id
                            ? assigneeById.get(comment.agent_id) ?? "Agent"
                            : "Admin"}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatCommentTimestamp(comment.created_at)}
                      </span>
                    </div>
                    {comment.message?.trim() ? (
                      <div className="mt-2 text-xs text-slate-900">
                        <ReactMarkdown
                          components={{
                            p: ({ ...props }) => (
                              <p className="mb-2 last:mb-0" {...props} />
                            ),
                            ul: ({ ...props }) => (
                              <ul className="mb-2 list-disc pl-5" {...props} />
                            ),
                            ol: ({ ...props }) => (
                              <ol className="mb-2 list-decimal pl-5" {...props} />
                            ),
                            li: ({ ...props }) => (
                              <li className="mb-1" {...props} />
                            ),
                            strong: ({ ...props }) => (
                              <strong className="font-semibold" {...props} />
                            ),
                          }}
                        >
                          {comment.message}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">—</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent aria-label="Edit task">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>
              Update task details, priority, status, or assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Title
              </label>
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Task title"
                disabled={!selectedTask || isSavingTask}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </label>
              <Textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                placeholder="Task details"
                className="min-h-[140px]"
                disabled={!selectedTask || isSavingTask}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </label>
                <Select
                  value={editStatus}
                  onValueChange={setEditStatus}
                  disabled={!selectedTask || isSavingTask}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Priority
                </label>
                <Select
                  value={editPriority}
                  onValueChange={setEditPriority}
                  disabled={!selectedTask || isSavingTask}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Assignee
              </label>
              <Select
                value={editAssigneeId || "unassigned"}
                onValueChange={(value) =>
                  setEditAssigneeId(value === "unassigned" ? "" : value)
                }
                disabled={!selectedTask || isSavingTask}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignableAgents.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Add agents to assign tasks.
                </p>
              ) : null}
            </div>
            {saveTaskError ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                {saveTaskError}
              </div>
            ) : null}
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={!selectedTask || isSavingTask}
              className="border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
            >
              Delete task
            </Button>
            <Button
              variant="outline"
              onClick={handleTaskReset}
              disabled={!selectedTask || isSavingTask || !hasTaskChanges}
            >
              Reset
            </Button>
            <Button
              onClick={() => handleTaskSave(true)}
              disabled={!selectedTask || isSavingTask || !hasTaskChanges}
            >
              {isSavingTask ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent aria-label="Delete task">
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
            <DialogDescription>
              This removes the task permanently. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTaskError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">
              {deleteTaskError}
            </div>
          ) : null}
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeletingTask}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteTask}
              disabled={isDeletingTask}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {isDeletingTask ? "Deleting…" : "Delete task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(nextOpen) => {
          setIsDialogOpen(nextOpen);
          if (!nextOpen) {
            resetForm();
          }
        }}
      >
        <DialogContent aria-label={titleLabel}>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              Add a task to the inbox and triage it when you are ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-strong">Title</label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Prepare launch notes"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-strong">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional details"
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-strong">
                Priority
              </label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
                {createError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={isCreating}
            >
              {isCreating ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* onboarding moved to board settings */}
    </DashboardShell>
  );
}
