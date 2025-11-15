"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EditOrganizationPage() {
  const { viewer } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};

  const employees = useQuery(api.employees.list);
  const addEmployee = useMutation(api.employees.add);
  const removeEmployee = useMutation(api.employees.remove);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoading = employees === undefined;

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !email.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await addEmployee({
        firstName: firstName.trim(),
        email: email.trim(),
      });
      setFirstName("");
      setEmail("");
    } catch (error) {
      console.error("Failed to add employee:", error);
      alert("Failed to add employee. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEmployee = async (employeeId: string) => {
    try {
      await removeEmployee({ employeeId: employeeId as any });
    } catch (error) {
      console.error("Failed to remove employee:", error);
      alert("Failed to remove employee. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div>
        <h2 className="font-bold text-2xl text-slate-800 dark:text-slate-200">
          Manage Employees - {viewer ?? "Anonymous"}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Add or remove employees from your organization.
        </p>
      </div>

      {/* Add Employee Form */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Add New Employee
        </h3>
        <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="firstName"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                First Name
              </label>
              <Input
                id="firstName"
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full md:w-auto"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Adding..." : "Add Employee"}
          </Button>
        </form>
      </div>

      {/* Employee List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-4">
          Employees ({isLoading ? "..." : employees.length})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              <div
                className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              ></div>
              <div
                className="w-2 h-2 bg-slate-600 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              ></div>
              <p className="ml-2 text-slate-600 dark:text-slate-400">Loading employees...</p>
            </div>
          </div>
        ) : employees.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">
            No employees added yet. Add your first employee above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {employees.map((employee) => (
              <div
                key={employee._id}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {employee.firstName}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {employee.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveEmployee(employee._id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <span className="text-xl">×</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
