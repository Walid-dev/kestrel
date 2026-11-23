// A PDF's text, read by the computer's own PDF engine (Apple's PDFKit, the one Preview and Safari use), in a small
// program of its own process: kestrel never parses a PDF itself, and nothing inside the PDF ever runs. Each page's
// text in order, a blank line between pages. Exit 2 when the file isn't a PDF this computer can open. Deploy builds
// it into dist/pdf-text (src/domain/notes/pdf.ts runs it).
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count == 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("not a PDF this computer can open\n".data(using: .utf8)!)
  exit(2)
}
var pages: [String] = []
for i in 0..<doc.pageCount {
  if let text = doc.page(at: i)?.string { pages.append(text) }
}
print(pages.joined(separator: "\n\n"))
