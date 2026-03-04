#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
ROSTER_PATH = ROOT / "company" / "roster.json"
WORKFLOW_PATH = ROOT / "company" / "workflow.json"
SEED_TASKS_PATH = ROOT / "company" / "seed_tasks.json"
STATE_PATH = ROOT / "company" / "runtime" / "state.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def init_state(force: bool = False):
    if STATE_PATH.exists() and not force:
        raise SystemExit("state already exists. use --force to overwrite")

    roster = load_json(ROSTER_PATH)
    seed = load_json(SEED_TASKS_PATH)
    now = utc_now_iso()

    state = {
        "project": seed["project"],
        "created_at": now,
        "updated_at": now,
        "tasks": seed["tasks"],
        "presence": [
            {
                "user_id": emp["id"],
                "state": "IDLE",
                "task_id": None,
                "waiting_for_user_id": None,
                "reason": "",
                "since_time": now,
            }
            for emp in roster["employees"]
        ],
    }
    save_json(STATE_PATH, state)
    print(f"initialized state at {STATE_PATH}")


def index_tasks(tasks: List[Dict]) -> Dict[str, Dict]:
    return {t["id"]: t for t in tasks}


def compute_presence(state: Dict) -> List[Dict]:
    tasks = state["tasks"]
    task_map = index_tasks(tasks)
    open_tasks_by_owner: Dict[int, List[Dict]] = {}
    for t in tasks:
        if t["status"] != "DONE":
            open_tasks_by_owner.setdefault(t["owner_id"], []).append(t)

    # pick earliest stage task per owner (sorted by stage order then id)
    workflow = load_json(WORKFLOW_PATH)
    stage_order = {s: i for i, s in enumerate(workflow["stages"])}
    now = utc_now_iso()

    new_presence = []
    for p in state["presence"]:
        uid = p["user_id"]
        owner_tasks = sorted(
            open_tasks_by_owner.get(uid, []), key=lambda t: (stage_order.get(t["stage"], 999), t["id"])
        )
        if not owner_tasks:
            new_presence.append({
                "user_id": uid,
                "state": "IDLE",
                "task_id": None,
                "waiting_for_user_id": None,
                "reason": "",
                "since_time": p.get("since_time") or now,
            })
            continue

        task = owner_tasks[0]
        blockers = [dep for dep in task.get("depends_on", []) if task_map[dep]["status"] != "DONE"]
        if blockers:
            first_blocker = task_map[blockers[0]]
            new_presence.append({
                "user_id": uid,
                "state": "WAITING",
                "task_id": task["id"],
                "waiting_for_user_id": first_blocker["owner_id"],
                "reason": f"waiting dependency {first_blocker['id']}:{first_blocker['title']}",
                "since_time": p.get("since_time") or now,
            })
        else:
            new_presence.append({
                "user_id": uid,
                "state": "WORKING",
                "task_id": task["id"],
                "waiting_for_user_id": None,
                "reason": "",
                "since_time": p.get("since_time") or now,
            })

    return new_presence


def refresh_state():
    state = load_json(STATE_PATH)
    state["presence"] = compute_presence(state)
    state["updated_at"] = utc_now_iso()
    save_json(STATE_PATH, state)
    print("state refreshed")


def complete_task(task_id: str):
    state = load_json(STATE_PATH)
    found = False
    for t in state["tasks"]:
        if t["id"] == task_id:
            t["status"] = "DONE"
            t["stage"] = "DONE"
            found = True
            break
    if not found:
        raise SystemExit(f"task {task_id} not found")
    state["updated_at"] = utc_now_iso()
    state["presence"] = compute_presence(state)
    save_json(STATE_PATH, state)
    print(f"task {task_id} marked DONE")


def print_status():
    roster = load_json(ROSTER_PATH)
    state = load_json(STATE_PATH)
    task_map = index_tasks(state["tasks"])
    emp_map = {e["id"]: e for e in roster["employees"]}

    print(f"# {roster['company_name']}")
    print(f"project: {state['project']}")
    print(f"updated_at: {state['updated_at']}\n")

    for p in sorted(state["presence"], key=lambda x: x["user_id"]):
        emp = emp_map[p["user_id"]]
        task_title = task_map[p["task_id"]]["title"] if p["task_id"] else "-"
        waiting = f" waiting_for={p['waiting_for_user_id']}" if p["waiting_for_user_id"] else ""
        reason = f" reason={p['reason']}" if p["reason"] else ""
        print(f"- {emp['name']} ({emp['role']}): {p['state']} task={task_title}{waiting}{reason}")


def main():
    parser = argparse.ArgumentParser(description="6-AI company simulator")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="initialize runtime state")
    p_init.add_argument("--force", action="store_true", help="overwrite existing state")

    sub.add_parser("refresh", help="recompute presence from current tasks")

    p_complete = sub.add_parser("complete", help="mark one task as DONE")
    p_complete.add_argument("task_id")

    sub.add_parser("status", help="print company status")

    args = parser.parse_args()
    if args.cmd == "init":
        init_state(force=args.force)
    elif args.cmd == "refresh":
        refresh_state()
    elif args.cmd == "complete":
        complete_task(args.task_id)
    elif args.cmd == "status":
        print_status()


if __name__ == "__main__":
    main()
