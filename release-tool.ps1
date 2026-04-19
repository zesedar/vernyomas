# =============================================================
#  Tensio Release Tool
#  Reads current version, prompts for new one + changelog,
#  then updates sw.js, app.js and version.json.
# =============================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Stand in the script's directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$versionFile = Join-Path $scriptDir 'version.json'
$swFile      = Join-Path $scriptDir 'sw.js'
$appFile     = Join-Path $scriptDir 'app.js'

# ---- Read current version ----
if (-not (Test-Path $versionFile)) {
    [System.Windows.Forms.MessageBox]::Show("Nem talalom a version.json fajlt:`n$versionFile", 'Tensio Release', 'OK', 'Error') | Out-Null
    exit 1
}

$current = Get-Content -Raw $versionFile -Encoding UTF8 | ConvertFrom-Json
$currentVersion = $current.version

# ---- GUI ----
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Tensio - Uj verzio kiadasa'
$form.Size = New-Object System.Drawing.Size(520, 500)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$form.BackColor = [System.Drawing.Color]::FromArgb(246, 241, 231)

# Title
$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = 'Uj verzio kiadasa'
$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(11, 18, 32)
$titleLabel.Location = New-Object System.Drawing.Point(20, 18)
$titleLabel.Size = New-Object System.Drawing.Size(460, 30)
$form.Controls.Add($titleLabel)

# Current version
$currentLabel = New-Object System.Windows.Forms.Label
$currentLabel.Text = "Jelenlegi verzio:  v$currentVersion"
$currentLabel.Font = New-Object System.Drawing.Font('Consolas', 10)
$currentLabel.ForeColor = [System.Drawing.Color]::FromArgb(92, 100, 121)
$currentLabel.Location = New-Object System.Drawing.Point(20, 50)
$currentLabel.Size = New-Object System.Drawing.Size(460, 22)
$form.Controls.Add($currentLabel)

# New version label
$newLabel = New-Object System.Windows.Forms.Label
$newLabel.Text = 'Uj verzio (pl. 1.1.0):'
$newLabel.Location = New-Object System.Drawing.Point(20, 88)
$newLabel.Size = New-Object System.Drawing.Size(460, 20)
$newLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($newLabel)

# New version textbox - suggest patch+1
$newVersionBox = New-Object System.Windows.Forms.TextBox
$parts = $currentVersion -split '\.'
if ($parts.Length -eq 3) {
    try {
        $suggested = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
    } catch { $suggested = $currentVersion }
} else { $suggested = $currentVersion }
$newVersionBox.Text = $suggested
$newVersionBox.Location = New-Object System.Drawing.Point(20, 108)
$newVersionBox.Size = New-Object System.Drawing.Size(200, 25)
$newVersionBox.Font = New-Object System.Drawing.Font('Consolas', 11)
$form.Controls.Add($newVersionBox)

# Changelog label
$notesLabel = New-Object System.Windows.Forms.Label
$notesLabel.Text = 'Valtozasok leirasa (egy sor = egy bejegyzes):'
$notesLabel.Location = New-Object System.Drawing.Point(20, 148)
$notesLabel.Size = New-Object System.Drawing.Size(460, 20)
$notesLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($notesLabel)

# Changelog textbox
$notesBox = New-Object System.Windows.Forms.TextBox
$notesBox.Multiline = $true
$notesBox.ScrollBars = 'Vertical'
$notesBox.AcceptsReturn = $true
$notesBox.Location = New-Object System.Drawing.Point(20, 170)
$notesBox.Size = New-Object System.Drawing.Size(465, 210)
$notesBox.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$notesBox.Text = ""
$form.Controls.Add($notesBox)

# Hint
$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = 'Tipp: minden sor kulon pont lesz a Mi valtozott listaban.'
$hintLabel.Location = New-Object System.Drawing.Point(20, 385)
$hintLabel.Size = New-Object System.Drawing.Size(465, 20)
$hintLabel.Font = New-Object System.Drawing.Font('Segoe UI', 8, [System.Drawing.FontStyle]::Italic)
$hintLabel.ForeColor = [System.Drawing.Color]::FromArgb(136, 146, 166)
$form.Controls.Add($hintLabel)

# OK / Cancel buttons
$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = 'Kiadas'
$okButton.Location = New-Object System.Drawing.Point(330, 420)
$okButton.Size = New-Object System.Drawing.Size(155, 34)
$okButton.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$okButton.BackColor = [System.Drawing.Color]::FromArgb(11, 18, 32)
$okButton.ForeColor = [System.Drawing.Color]::FromArgb(246, 241, 231)
$okButton.FlatStyle = 'Flat'
$okButton.FlatAppearance.BorderSize = 0
$okButton.DialogResult = 'OK'
$form.Controls.Add($okButton)
$form.AcceptButton = $okButton

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = 'Megse'
$cancelButton.Location = New-Object System.Drawing.Point(230, 420)
$cancelButton.Size = New-Object System.Drawing.Size(90, 34)
$cancelButton.FlatStyle = 'Flat'
$cancelButton.DialogResult = 'Cancel'
$form.Controls.Add($cancelButton)
$form.CancelButton = $cancelButton

# ---- Run dialog ----
$result = $form.ShowDialog()
if ($result -ne 'OK') { exit 0 }

$newVersion = $newVersionBox.Text.Trim()
$notesRaw = $notesBox.Text

# ---- Validation ----
if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
    [System.Windows.Forms.MessageBox]::Show("Ervenytelen verzioformatum: '$newVersion'`n`nHasznalj semver formatot, pl. 1.0.0, 1.1.0, 2.0.1", 'Tensio Release', 'OK', 'Error') | Out-Null
    exit 1
}
if ($newVersion -eq $currentVersion) {
    [System.Windows.Forms.MessageBox]::Show("Az uj verzio ($newVersion) megegyezik a jelenlegivel. Valassz mast.", 'Tensio Release', 'OK', 'Warning') | Out-Null
    exit 1
}

$notes = @()
foreach ($line in ($notesRaw -split "`r`n|`r|`n")) {
    $t = $line.Trim()
    if ($t) { $notes += $t }
}
if ($notes.Count -eq 0) {
    $ask = [System.Windows.Forms.MessageBox]::Show('Nem adtal meg valtozaslistat. Biztos igy akarod kiadni?', 'Tensio Release', 'YesNo', 'Question')
    if ($ask -ne 'Yes') { exit 0 }
    $notes = @("Kisebb frissitesek.")
}

# ---- 1. Update version.json ----
$today = Get-Date -Format 'yyyy-MM-dd'
$newVersionObj = [ordered]@{
    version  = $newVersion
    released = $today
    notes    = $notes
}
$json = $newVersionObj | ConvertTo-Json -Depth 5
# Write BOM-less UTF-8 (avoids browser fetch issues with some JSON parsers)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($versionFile, $json, $utf8NoBom)

# ---- 2. Update sw.js ----
$sw = Get-Content -Raw $swFile -Encoding UTF8
$swPattern = "const\s+VERSION\s*=\s*['""][^'""]*['""]\s*;"
$swReplacement = "const VERSION = '$newVersion';"
$newSw = [regex]::Replace($sw, $swPattern, $swReplacement)
if ($newSw -eq $sw) {
    [System.Windows.Forms.MessageBox]::Show("Nem talaltam a VERSION sort a sw.js-ben! A fajl nem valtozott.", 'Tensio Release', 'OK', 'Warning') | Out-Null
} else {
    [System.IO.File]::WriteAllText($swFile, $newSw, $utf8NoBom)
}

# ---- 3. Update app.js ----
$app = Get-Content -Raw $appFile -Encoding UTF8
$appPattern = "const\s+CURRENT_VERSION\s*=\s*['""][^'""]*['""]\s*;"
$appReplacement = "const CURRENT_VERSION = '$newVersion';"
$newApp = [regex]::Replace($app, $appPattern, $appReplacement)
if ($newApp -eq $app) {
    [System.Windows.Forms.MessageBox]::Show("Nem talaltam a CURRENT_VERSION sort az app.js-ben! A fajl nem valtozott.", 'Tensio Release', 'OK', 'Warning') | Out-Null
} else {
    [System.IO.File]::WriteAllText($appFile, $newApp, $utf8NoBom)
}

# ---- Summary ----
$summary = "Kiadas kesz: v$newVersion`n`nFrissitett fajlok:`n  - version.json`n  - sw.js`n  - app.js`n`nValtozasok:`n"
foreach ($n in $notes) { $summary += "  * $n`n" }
$summary += "`nKovetkezo lepes:`n  git add -A`n  git commit -m `"Release v$newVersion`"`n  git push"

[System.Windows.Forms.MessageBox]::Show($summary, "Tensio - v$newVersion kiadva", 'OK', 'Information') | Out-Null
