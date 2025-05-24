import json
import argparse
import os
from datetime import datetime

TASKS_FILE = "tasks.json"

def load_tasks():
    if not os.path.exists(TASKS_FILE):
        return []
    with open(TASKS_FILE, "r") as file:
        return json.load(file)

def save_tasks(tasks):
    with open(TASKS_FILE, "w") as file:
        json.dump(tasks, file, indent=4)

def add_task(description, due):
    tasks = load_tasks()
    task = {
        "id": len(tasks) + 1,
        "description": description,
        "due": due,
        "done": False
    }
    tasks.append(task)
    save_tasks(tasks)
    print("✅ Task added!")

def list_tasks():
    tasks = load_tasks()
    if not tasks:
        print("No tasks found.")
        return
    for task in tasks:
        status = "✔️" if task["done"] else "❌"
        print(f'{task["id"]}. [{status}] {task["description"]} (Due: {task["due"]})')

def mark_done(task_id):
    tasks = load_tasks()
    for task in tasks:
        if task["id"] == task_id:
            task["done"] = True
            save_tasks(tasks)
            print("✅ Task marked as done.")
            return
    print("Task not found.")

def delete_task(task_id):
    tasks = load_tasks()
    tasks = [task for task in tasks if task["id"] != task_id]
    for i, task in enumerate(tasks):
        task["id"] = i + 1
    save_tasks(tasks)
    print("🗑️ Task deleted.")

def main():
    parser = argparse.ArgumentParser(description="Simple CLI Task Manager")
    subparsers = parser.add_subparsers(dest="command")

    add_parser = subparsers.add_parser("add", help="Add a new task")
    add_parser.add_argument("description", type=str, help="Task description")
    add_parser.add_argument("due", type=str, help="Due date (YYYY-MM-DD)")

    list_parser = subparsers.add_parser("list", help="List all tasks")

    done_parser = subparsers.add_parser("done", help="Mark task as done")
    done_parser.add_argument("id", type=int, help="Task ID")

    delete_parser = subparsers.add_parser("delete", help="Delete a task")
    delete_parser.add_argument("id", type=int, help="Task ID")

    args = parser.parse_args()

    if args.command == "add":
        add_task(args.description, args.due)
    elif args.command == "list":
        list_tasks()
    elif args.command == "done":
        mark_done(args.id)
    elif args.command == "delete":
        delete_task(args.id)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
