import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { 
  Loader2, Plus, Trash2, Sparkles, Receipt, Wallet, 
  Calendar, Activity 
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  useGetExpenses,
  useCreateExpense,
  useDeleteExpense,
  useGetExpenseSummary,
  getGetExpensesQueryKey,
  getGetExpenseSummaryQueryKey,
} from "@workspace/api-client-react";

// --- Schema & Helpers ---
const formSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  category: z.enum(["Food", "Transport", "Mobile/Internet", "Entertainment", "Education", "Other"], {
    required_error: "Please select a category",
  }),
  date: z.string().min(1, "Date is required"),
  note: z.string().optional(),
});

const formatPKR = (amount: number) => `Rs. ${amount.toLocaleString("en-PK")}`;

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Food': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
    case 'Transport': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
    case 'Mobile/Internet': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
    case 'Entertainment': return 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800';
    case 'Education': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
    default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
  }
};

// --- Subcomponents ---

function SummaryCards() {
  const { data: summary, isLoading } = useGetExpenseSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl hidden lg:block" />
      </div>
    );
  }

  if (!summary) return null;

  const totalThisWeek = summary.weekTotal || 0;
  const totalThisMonth = summary.monthTotal || 0;
  const byCategory = [...(summary.byCategory || [])].sort((a,b)=>b.total - a.total);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      <Card className="bg-white dark:bg-card border-none shadow-sm shadow-black/5 ring-1 ring-border/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">This Week</p>
          <h2 className="text-3xl font-bold text-foreground font-serif tracking-tight">
            {formatPKR(totalThisWeek)}
          </h2>
        </CardContent>
      </Card>
      
      <Card className="bg-white dark:bg-card border-none shadow-sm shadow-black/5 ring-1 ring-border/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-xl">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">This Month</p>
          <h2 className="text-3xl font-bold text-foreground font-serif tracking-tight">
            {formatPKR(totalThisMonth)}
          </h2>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-card border-none shadow-sm shadow-black/5 ring-1 ring-border/50 rounded-2xl flex flex-col md:col-span-2 lg:col-span-1">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 font-sans text-muted-foreground uppercase tracking-wider">
            Top Categories
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-center">
          {byCategory.length > 0 ? (
            <div className="space-y-3.5">
               {byCategory.slice(0, 3).map(c => (
                 <div key={c.category} className="flex justify-between items-center text-sm">
                   <span className="font-medium text-foreground/80 flex items-center gap-2">
                     <span className={`w-2 h-2 rounded-full ${getCategoryColor(c.category).split(' ')[0]}`} />
                     {c.category}
                   </span>
                   <span className="text-foreground font-semibold">{formatPKR(c.total)}</span>
                 </div>
               ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-4">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExpenseForm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createExpense = useCreateExpense();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: "" as unknown as number,
      category: undefined,
      date: new Date().toISOString().split("T")[0],
      note: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createExpense.mutate(
      { data: values as any },
      {
        onSuccess: () => {
          toast({ title: "Expense logged successfully", description: "Your kharcha has been recorded." });
          form.reset({ ...values, amount: "" as unknown as number, note: "" });
          queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetExpenseSummaryQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save expense. Please try again.", variant: "destructive" });
        }
      }
    );
  }

  return (
    <Card className="bg-white dark:bg-card border-none shadow-sm shadow-black/5 ring-1 ring-border/50 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-xl font-serif">Add Kharcha</CardTitle>
        <CardDescription>Record a new expense for today.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (PKR)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm font-medium">Rs.</span>
                        <Input type="number" placeholder="0" className="pl-10 text-lg font-medium h-11" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 text-base">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["Food", "Transport", "Mobile/Internet", "Entertainment", "Education", "Other"].map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="cursor-text h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="What was this for? (e.g. Biryani at cafe)" 
                      className="resize-none h-20 text-base" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full h-12 text-base font-medium rounded-xl" disabled={createExpense.isPending}>
              {createExpense.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
              Save Expense
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function buildAdvicePrompt(expenses: { amount: number; category: string }[]) {
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    total += e.amount;
  }
  const breakdown = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  - ${cat}: Rs. ${amt.toFixed(0)}`)
    .join("\n");

  return `You are a friendly financial advisor helping Pakistani university students manage their money better.

Here is the student's recent expense data:
Total spent: Rs. ${total.toFixed(0)}
Number of transactions: ${expenses.length}
Spending by category:
${breakdown}

Please analyze their spending patterns and give 3–5 personalised, practical, and friendly saving tips in simple English.
- Point out which category they're overspending in (if any) and why it matters for a student on a budget.
- Give concrete, actionable suggestions relevant to a Pakistani student (e.g. mention local context like hostel food, rickshaw vs. bus, mobile packages, etc.).
- Keep the tone encouraging and supportive, not judgmental.
- Format your response as clear paragraphs or a short numbered list. Do not use markdown headers.`;
}

function AiAdviceCard() {
  const { data: expenses } = useGetExpenses();
  const [advice, setAdvice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleGetAdvice = async () => {
    if (!expenses || expenses.length === 0) return;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
      setError("Gemini API key not configured. Set VITE_GEMINI_API_KEY in Replit Secrets.");
      return;
    }
    setError(null);
    setIsPending(true);
    try {
      const prompt = buildAdvicePrompt(expenses);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setAdvice(text ?? "Sorry, I could not generate advice right now.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get advice. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-accent/40 to-background border-accent/20 overflow-hidden relative rounded-2xl">
      <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none text-primary transform translate-x-4 -translate-y-4">
        <Sparkles className="w-40 h-40" />
      </div>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-serif">
          <span className="p-1.5 bg-white dark:bg-card rounded-md shadow-sm">
            <Sparkles className="h-5 w-5 text-primary" />
          </span>
          Dost Advice
        </CardTitle>
        <CardDescription className="text-sm">
          Get smart tips on your spending habits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {advice ? (
          <div className="bg-white/80 dark:bg-black/30 p-5 rounded-xl text-sm text-foreground/90 leading-relaxed border border-white/60 dark:border-white/10 backdrop-blur-md shadow-sm relative z-10 font-medium">
            {advice}
          </div>
        ) : (
          <>
            {error && (
              <div className="relative z-10 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive font-medium">
                {error}
              </div>
            )}
            <Button 
              onClick={handleGetAdvice} 
              disabled={!expenses || expenses.length === 0 || isPending}
              className="w-full relative z-10 h-11 rounded-xl font-medium"
              variant="secondary"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {expenses?.length === 0 ? "Log some kharcha first" : error ? "Try Again 💡" : "Get Advice 💡"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseList() {
  const { data: expenses, isLoading } = useGetExpenses();
  const deleteExpense = useDeleteExpense();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    if(!confirm("Delete this expense?")) return;
    deleteExpense.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Expense deleted" });
        queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetExpenseSummaryQueryKey() });
      }
    });
  };

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <Card className="bg-white dark:bg-card border-none shadow-sm shadow-black/5 ring-1 ring-border/50 h-full flex flex-col rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-serif">Recent History</CardTitle>
        <CardDescription>Your latest transactions</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {!expenses || expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-full min-h-[300px] text-center border-2 border-dashed border-border/60 rounded-xl bg-background/30">
            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-4">
              <Receipt className="h-7 w-7 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-serif font-medium text-foreground">Clean slate!</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">
              You haven't spent anything yet. Great job (or log it!).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {expenses.map((expense) => {
              const date = parseISO(expense.date);
              return (
                <div 
                  key={expense.id} 
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/40 bg-background/50 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex flex-col items-center justify-center min-w-[3.5rem] py-2 px-1 bg-white dark:bg-black/20 rounded-lg shadow-sm border border-border/50 text-center">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{format(date, 'MMM')}</span>
                      <span className="text-xl font-serif font-bold text-foreground leading-none mt-1">{format(date, 'dd')}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", getCategoryColor(expense.category))}>
                          {expense.category}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground sm:hidden">
                          {format(date, 'MMM dd, yyyy')}
                        </span>
                      </div>
                      {expense.note && (
                        <p className="text-sm text-foreground font-medium mb-0.5">
                          {expense.note}
                        </p>
                      )}
                      {!expense.note && <p className="text-sm text-muted-foreground italic mb-0.5">No note</p>}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-4 mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-border/50">
                    <span className="font-serif font-semibold text-base sm:text-lg">
                      {formatPKR(expense.amount)}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2"
                      onClick={() => handleDelete(expense.id)}
                      disabled={deleteExpense.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full pb-16 bg-background relative selection:bg-primary/20">
      <header className="bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-sm shadow-primary/20">
              <Wallet className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold font-serif tracking-tight text-foreground">
              Kharcha Manager
            </h1>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 py-1.5 bg-accent/50 rounded-full border border-accent-foreground/10">
            Student Edition
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 pt-8">
        <SummaryCards />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-8">
            <ExpenseForm />
            <AiAdviceCard />
          </div>
          
          <div className="lg:col-span-7">
            <ExpenseList />
          </div>
        </div>
      </main>
    </div>
  );
}
