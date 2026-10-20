import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FailureRecord {
  row: number;
  item?: string;
  reason: string;
}

interface ParsedRow {
  rowNumber: number;
  name: string;
  email: string;
  role: string;
  department: string;
}

async function extractRowsFromFile(file: File): Promise<ParsedRow[]> {
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");

  if (isExcel) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    const sheetData = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
      worksheet,
      {
        header: 1,
        blankrows: false,
      }
    );

    if (sheetData.length === 0) return [];

    // Check if first row is a header
    const firstRow = (sheetData[0] || []).map((c) => String(c ?? "").trim());
    let nameIdx = 0;
    let emailIdx = 1;
    let roleIdx = 2;
    let deptIdx = 3;

    const hasHeader = firstRow.some((c) => {
      const lower = c.toLowerCase();
      return lower.includes("email") || lower.includes("name") || lower.includes("role");
    });

    let startIndex = 0;
    if (hasHeader) {
      startIndex = 1;
      firstRow.forEach((col, idx) => {
        const lower = col.toLowerCase();
        if (lower.includes("name")) nameIdx = idx;
        else if (lower.includes("email")) emailIdx = idx;
        else if (lower.includes("role")) roleIdx = idx;
        else if (lower.includes("dept") || lower.includes("department")) deptIdx = idx;
      });
    }

    const rows: ParsedRow[] = [];
    for (let i = startIndex; i < sheetData.length; i++) {
      const rawRow = sheetData[i];
      if (!rawRow || rawRow.length === 0) continue;

      const name = String(rawRow[nameIdx] ?? "").trim();
      const email = String(rawRow[emailIdx] ?? "").trim();
      const role = String(rawRow[roleIdx] ?? "Member").trim();
      const department = String(rawRow[deptIdx] ?? "").trim();

      if (!name && !email) continue;

      rows.push({
        rowNumber: i + 1,
        name,
        email,
        role,
        department,
      });
    }

    return rows;
  } else {
    // CSV / Plain Text parser
    const fileContent = await file.text();
    const rawLines = fileContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (rawLines.length === 0) return [];

    const firstLineLower = rawLines[0].toLowerCase();
    const hasHeader =
      firstLineLower.includes("email") ||
      firstLineLower.includes("name") ||
      firstLineLower.includes("role") ||
      firstLineLower.includes("department");

    let nameIdx = 0;
    let emailIdx = 1;
    let roleIdx = 2;
    let deptIdx = 3;

    if (hasHeader) {
      const headerParts = rawLines[0]
        .split(",")
        .map((p) => p.trim().toLowerCase().replace(/^["']|["']$/g, ""));

      headerParts.forEach((col, idx) => {
        if (col.includes("name")) nameIdx = idx;
        else if (col.includes("email")) emailIdx = idx;
        else if (col.includes("role")) roleIdx = idx;
        else if (col.includes("dept") || col.includes("department")) deptIdx = idx;
      });
    }

    const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
    const rows: ParsedRow[] = [];

    dataLines.forEach((line, i) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const name = parts[nameIdx] ?? parts[0] ?? "";
      const email = parts[emailIdx] ?? parts[1] ?? "";
      const role = parts[roleIdx] ?? parts[2] ?? "Member";
      const department = parts[deptIdx] ?? parts[3] ?? "";

      if (!name && !email) return;

      rows.push({
        rowNumber: hasHeader ? i + 2 : i + 1,
        name,
        email,
        role,
        department,
      });
    });

    return rows;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // If target query param or BACKEND_API_URL is configured, proxy to external backend
    const targetBackend =
      request.nextUrl.searchParams.get("target") || process.env.BACKEND_API_URL;

    if (targetBackend) {
      try {
        const incomingFormData = await request.formData();
        const backendRes = await fetch(targetBackend, {
          method: "POST",
          body: incomingFormData,
        });

        return new Response(backendRes.body, {
          status: backendRes.status,
          headers: {
            "Content-Type":
              backendRes.headers.get("Content-Type") ||
              "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (proxyErr: unknown) {
        const msg = proxyErr instanceof Error ? proxyErr.message : "Proxy error";
        return new Response(
          `data: ${JSON.stringify({
            percent: 0,
            processedRows: 0,
            totalRows: 0,
            status: "ERROR",
            error: `Failed to proxy to external backend (${targetBackend}): ${msg}`,
          })}\n\n`,
          {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        `data: ${JSON.stringify({
          percent: 0,
          processedRows: 0,
          totalRows: 0,
          status: "ERROR",
          error: "No file was provided in the upload request.",
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
          },
        }
      );
    }

    const parsedRows = await extractRowsFromFile(file);

    if (parsedRows.length === 0) {
      return new Response(
        `data: ${JSON.stringify({
          percent: 100,
          processedRows: 0,
          totalRows: 0,
          status: "COMPLETED",
          failures: [{ row: 0, reason: "The uploaded file contains no readable user data rows." }],
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
          },
        }
      );
    }

    const totalRows = parsedRows.length;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const failures: FailureRecord[] = [];
        const seenEmails = new Set<string>();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Send initial starting frame
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              percent: 0,
              processedRows: 0,
              totalRows,
              status: "STARTING",
            })}\n\n`
          )
        );

        let processedRows = 0;

        for (const item of parsedRows) {
          const { rowNumber, name, email } = item;

          // Validation
          if (!name) {
            failures.push({
              row: rowNumber,
              item: email || `Row #${rowNumber}`,
              reason: "Missing user name.",
            });
          } else if (!email) {
            failures.push({
              row: rowNumber,
              item: name,
              reason: "Missing email address.",
            });
          } else if (!emailRegex.test(email)) {
            failures.push({
              row: rowNumber,
              item: email,
              reason: `Invalid email format: "${email}".`,
            });
          } else if (seenEmails.has(email.toLowerCase())) {
            failures.push({
              row: rowNumber,
              item: email,
              reason: `Duplicate email detected: "${email}".`,
            });
          } else {
            seenEmails.add(email.toLowerCase());
          }

          processedRows++;
          const percent = Number(((processedRows / totalRows) * 100).toFixed(1));

          // Emit SSE progress event
          const payload = {
            percent,
            processedRows,
            totalRows,
            status: "PROCESSING",
            currentRow: email || name || `Row #${rowNumber}`,
            failuresCount: failures.length,
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

          // Adaptive pacing for visible streaming feedback
          const delayMs = totalRows > 500 ? 5 : totalRows > 100 ? 15 : 25;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // Send final completion frame
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              percent: 100,
              processedRows: totalRows,
              totalRows,
              status: "COMPLETED",
              failures,
            })}\n\n`
          )
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(
      `data: ${JSON.stringify({
        percent: 0,
        processedRows: 0,
        totalRows: 0,
        status: "ERROR",
        error: message,
      })}\n\n`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      }
    );
  }
}
