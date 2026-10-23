import Foundation

enum ProjectTemplates {
    static let englishSource = #"""
        \documentclass{article}
        \usepackage{amsmath,graphicx,hyperref}
        \title{Untitled Document}
        \author{Your Name}
        \date{\today}
        \begin{document}
        \maketitle
        \section{Introduction}
        Write your content here.
        \end{document}

        """#
}
