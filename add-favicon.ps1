$favicon = '  <link rel="icon" type="image/svg+xml" href="/admin/favicon.svg" />'
$pages = @("index","apps","keys","users","logs","vars","discord","partners","api-docs")
foreach ($p in $pages) {
    $path = "C:\Users\Administrator\Downloads\keyauth-web\public\admin\$p.html"
    if (Test-Path $path) {
        $c = Get-Content $path -Raw
        if ($c -notmatch 'favicon') {
            $c = $c -replace '(<meta charset="UTF-8" />)', "`$1`n$favicon"
            Set-Content $path $c -NoNewline
            Write-Host "OK: $p.html"
        } else {
            Write-Host "SKIP: $p.html (already has favicon)"
        }
    }
}
Write-Host "Done"
