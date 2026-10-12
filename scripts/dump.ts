import { prisma } from "../src/lib/prisma";

const main = async () => {
  const plan = await prisma.allocationPlan.findFirst({ where: { status: "APPLIED" }, include: { allocations: true } });
  console.log("PLAN", plan?.id, plan?.status, plan?.dataVersion);
  for (const a of plan!.allocations.sort((x, y) => x.taskId.localeCompare(y.taskId))) {
    console.log(
      `${a.taskId} ${a.status.padEnd(11)} ${(a.aircraftId ?? "-").padEnd(7)} ${(a.crewId ?? "-").padEnd(9)} score=${a.score} :: ${a.explanation.slice(0, 160)}`
    );
  }
  console.log("--- aircraft");
  for (const ac of await prisma.aircraft.findMany({ orderBy: { id: "asc" } }))
    console.log(`${ac.id} ${ac.status.padEnd(12)} ${ac.readinessPercentage}%`);
  console.log("--- tasks");
  for (const t of await prisma.operationalTask.findMany({ orderBy: { id: "asc" } }))
    console.log(`${t.id} ${t.status.padEnd(10)} ${t.priority.padEnd(9)} ${t.constraintNotes?.slice(0, 120) ?? ""}`);
  console.log("--- resources");
  for (const r of await prisma.supportResource.findMany({ orderBy: { id: "asc" } }))
    console.log(`${r.id} ${r.category.padEnd(22)} ${r.availableQuantity}/${r.minimumRequired} ${r.status}`);
  await prisma.$disconnect();
};
main();
