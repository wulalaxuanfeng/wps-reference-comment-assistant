$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$samplePath = Join-Path $projectRoot 'examples\测试论文.rtf'
$resultPath = Join-Path $projectRoot 'examples\实机测试结果.docx'
$wpsApp = $null
$testDoc = $null
$previousDoc = $null
$checks = New-Object System.Collections.Generic.List[string]
function Assert-Wra($condition, $message) { if (-not $condition) { throw $message }; $checks.Add($message) }
try {
    $wpsApp = New-Object -ComObject KWPS.Application
    if ($wpsApp.Documents.Count -gt 0) { $previousDoc = $wpsApp.ActiveDocument }
    $testDoc = $wpsApp.Documents.Open($samplePath, $false, $false)
    Assert-Wra ($testDoc.Comments.Count -eq 0) '测试文件初始无批注'
    $beforeText = [string]$testDoc.Content.Text
    $beforeFieldCount = $testDoc.Fields.Count
    $mentor = $testDoc.Comments.Add($testDoc.Range(0, 5), '导师测试批注，请保留。')
    $referenceRange = $testDoc.Content.Duplicate
    $referenceRange.Find.ClearFormatting()
    $referenceRange.Find.Text = '[1] 张三'
    $referenceRange.Find.MatchWildcards = $false
    $referenceRange.Find.Wrap = 0
    Assert-Wra ($referenceRange.Find.Execute()) '能够定位测试文献列表'
    $bodyEnd = $referenceRange.Start
    $cursor = 0
    $anchors = New-Object System.Collections.Generic.List[object]
    while ($cursor -lt $bodyEnd) {
        $range = $testDoc.Range($cursor, $bodyEnd)
        $find = $range.Find
        $find.ClearFormatting()
        $find.Text = '\[[0-9]@\]'
        $find.MatchWildcards = $true
        $find.Wrap = 0
        $find.Format = $false
        $find.Forward = $true
        if (-not $find.Execute()) { break }
        $id = [int]([string]$range.Text).Trim('[', ']')
        if ($id -eq 1 -or $id -eq 12) { $anchors.Add(@{ Start = $range.Start; End = $range.End; Id = $id; Super = $range.Font.Superscript }) }
        if ($range.End -le $cursor) { throw '查找未向前推进' }
        $cursor = $range.End
    }
    Assert-Wra ($anchors.Count -eq 3) '原生 Find 找到 3 处单编号引用'
    $references = @{ 1 = '[1] 张三, 李四. 参考文献助手示例研究[J]. 示例期刊, 2026, 1(1): 1-10.'; 12 = "[12] Wang X, Li Y. A long reference title that continues`non a manually wrapped line[J]. Example Journal, 2026, 2(1): 20-30." }
    for ($anchorIndex = $anchors.Count - 1; $anchorIndex -ge 0; $anchorIndex--) {
        $anchor = $anchors[$anchorIndex]
        Assert-Wra ($testDoc.Range($anchor.Start, $anchor.End).Text -eq ('[' + $anchor.Id + ']')) '添加前 Range 是完整编号'
        $comment = $testDoc.Comments.Add($testDoc.Range($anchor.Start, $anchor.End), '[REF_COMMENT:WPS_REFERENCE_ASSISTANT_V1]' + "`n" + $references[$anchor.Id])
        $comment.Author = '参考文献助手'
        $comment.Initial = 'WRA-V1-74F0'
        Assert-Wra ($comment.Author -eq '参考文献助手' -and $comment.Initial -eq 'WRA-V1-74F0') '批注作者和缩写可写入读回'
        $comment.Range.Text = $references[$anchor.Id]
        Assert-Wra ($comment.Scope.Text -eq ('[' + $anchor.Id + ']')) '批注锚定完整引用编号'
        Assert-Wra ($comment.Scope.Font.Superscript -eq $anchor.Super) '添加批注未改变上标格式'
    }
    Assert-Wra ($testDoc.Comments.Count -eq 4) '新增 3 条文献批注并保留导师批注'
    Assert-Wra ([string]$testDoc.Content.Text -ceq $beforeText) '添加批注未改变正文文字'
    Assert-Wra ($testDoc.Fields.Count -eq $beforeFieldCount) '添加批注未改变域数量'
    # 原生 Range 的坐标可能包含不可见批注引用标记，刷新前重新查找。
    $oldComments = New-Object System.Collections.Generic.List[object]
    for ($index = 1; $index -le $testDoc.Comments.Count; $index++) {
        $oldComment = $testDoc.Comments.Item($index)
        if ($oldComment.Author -eq '参考文献助手' -and $oldComment.Initial -eq 'WRA-V1-74F0') { $oldComments.Add($oldComment) }
    }
    $refreshAnchors = New-Object System.Collections.Generic.List[object]
    foreach ($oldComment in $oldComments) { $refreshAnchors.Add(@{ Start = $oldComment.Scope.Start; End = $oldComment.Scope.End; Text = [string]$oldComment.Range.Text }) }
    $refreshAnchors = @($refreshAnchors | Sort-Object { $_.Start } -Descending)
    foreach ($anchor in $refreshAnchors) {
        $newComment = $testDoc.Comments.Add($testDoc.Range($anchor.Start, $anchor.End), $anchor.Text)
        $newComment.Author = '参考文献助手'
        $newComment.Initial = 'WRA-V1-74F0'
    }
    for ($index = $oldComments.Count - 1; $index -ge 0; $index--) { $oldComments[$index].Delete() }
    Assert-Wra ($testDoc.Comments.Count -eq 4) '刷新可先添加新批注再通过旧对象清除，导师批注保留'
    $testDoc.SaveAs2($resultPath, 12)
    $testDoc.Close(0)
    $testDoc = $null
    $testDoc = $wpsApp.Documents.Open($resultPath, $false, $false)
    $ownedCount = 0
    for ($index = $testDoc.Comments.Count; $index -ge 1; $index--) {
        $comment = $testDoc.Comments.Item($index)
        if ($comment.Author -eq '参考文献助手' -and $comment.Initial -eq 'WRA-V1-74F0') {
            Assert-Wra ($comment.Scope.Text -match '^\[(1|12)\]$') '保存重开后批注锚点正确'
            Assert-Wra ($comment.Scope.Font.Superscript -eq -1) '保存重开后引用仍是上标'
            $comment.Delete(); $ownedCount++
        }
    }
    Assert-Wra ($ownedCount -eq 3) '保存 DOCX 重开后仍能识别并清除 3 条插件批注'
    Assert-Wra ($testDoc.Comments.Count -eq 1 -and $testDoc.Comments.Item(1).Range.Text -like '导师测试批注*') '清除后导师批注保留'
    Assert-Wra ([string]$testDoc.Content.Text -ceq $beforeText) '保存重开并清除后正文文字保持不变'
    $checkRange = $testDoc.Content.Duplicate
    $checkRange.Find.ClearFormatting()
    $checkRange.Find.Text = '\[[0-9]@\]'
    $checkRange.Find.MatchWildcards = $true
    $checkRange.Find.Wrap = 0
    Assert-Wra ($checkRange.Find.Execute()) '清除后仍能找到引用'
    Assert-Wra ($checkRange.Font.Superscript -eq -1) '清除批注后上标格式保持不变'
    $testDoc.Save()
    $report = @{ time = (Get-Date -Format o); status = 'passed'; checks = @($checks); result = $resultPath; note = '验证真实 WPS COM 接口及 DOCX 持久化；插件 JavaScript 业务逻辑另由单元测试验证。' }
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot 'logs\live-wps-test.json') -Encoding UTF8
    Write-Output ('PASS: ' + $checks.Count + ' 项真实 WPS 接口检查')
    Write-Output $resultPath
} finally {
    if ($null -ne $testDoc) { $testDoc.Close(0) }
    if ($null -ne $previousDoc) { try { $previousDoc.Activate() } catch {} }
    if ($null -ne $wpsApp) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wpsApp) }
}
