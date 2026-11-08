export function printWorker(controller, printReceipt) {
  let running = false;
  return async function drain() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const job = controller.get().printJobs.find(j => j.status === 'queued');
        if (!job) break;
        const sale = controller.get().sales.find(s => s.id === job.saleId);
        await controller.mutate(next => { const j = next.printJobs.find(j => j.id === job.id); j.status = 'printing'; j.attempts += 1; return next; });
        try {
          const receipt = job.kind === 'sales-report' ? job.receipt : sale?.receipt;
          if (!receipt) throw new Error('Saved receipt not found.');
          const pages = job.kind === 'sales-report' ? job.pages || [receipt] : [receipt];
          for (let page = job.nextPage || 0; page < pages.length; page++) {
            await printReceipt(job.address, pages[page], job.paperWidth);
            if (job.kind === 'sales-report') await controller.mutate(next => { next.printJobs.find(j => j.id === job.id).nextPage = page + 1; return next; });
          }
          await controller.mutate(next => { const j = next.printJobs.find(j => j.id === job.id); j.status = 'printed'; j.printedAt = new Date().toISOString(); j.error = ''; return next; });
        } catch (error) {
          await controller.mutate(next => { const j = next.printJobs.find(j => j.id === job.id); j.status = 'needs_review'; j.error = error.message || String(error); return next; });
          // A Bluetooth write cannot prove paper output. Never silently retry.
          break;
        }
      }
    } finally { running = false; }
  };
}
