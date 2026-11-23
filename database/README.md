# Incident Management PostgreSQL import

Use `data/postgresql/incident-management.sql` to import the schema and the current workspace snapshot. It contains private and published Weekly SLA, Monthly, and Aging reports, incident follow-ups and assignments, department mappings, IR analytics batches and tickets, admin accounts, and audit history. Report JSON preserves the original ticket details, SLA results, KPI results, remarks, and exceptions.

## Import into your server

1. Create a database named `incident_management` or choose an existing PostgreSQL database. Use a database role with permission to create a schema there.
2. Run the following from the application directory. Replace `YOUR_DB_HOST` and `YOUR_DB_USER` with your server details. Adjust the database name or port if needed.

   ```powershell
   psql -X -v ON_ERROR_STOP=1 -h YOUR_DB_HOST -p 5432 -U YOUR_DB_USER -d incident_management -f "data/postgresql/incident-management.sql"
   ```

3. Check the imported report and analytics counts in the target database.

   ```sql
   SELECT report_type, count(*) FROM incident_management.archived_reports GROUP BY report_type;
   SELECT report_type, count(*) FROM incident_management.published_reports GROUP BY report_type;
   SELECT count(*) FROM incident_management.ir_tickets;
   ```

The import creates the `incident_management` schema in one transaction. Use a destination where that schema name is available. PostgreSQL rejects a second import into the same schema, preserving the first copy.

Keep the SQL file in private storage. It includes incident records and account password hashes and salts. The export generates new session signing keys for the database copy.

## Generate a fresh export

From the application directory, run `node database/export.cjs` to read the default `data` directory, or the directory named in the shell's `SMAC_DATA_DIR`. For a server snapshot, use a consistent copy of the server's data directory. Use a new output filename each time.

```powershell
node database/export.cjs --data-dir "C:/path/to/server-data" --output "data/postgresql/incident-management-fresh.sql"
```

The exporter reads the active category files and uses the legacy flat file only when its category file is missing. If a browser still holds an old report archive, sign in from that browser to sync it to the app before exporting. ServiceDesk Plus credentials, browser preferences, and old backup copies stay in their original storage.

For an empty schema, run `database/schema.sql` by itself with `psql --single-transaction -v ON_ERROR_STOP=1`. Use the full export instead when you need the existing records.

The application currently reads and writes JSON files. This import creates a standalone PostgreSQL copy. Using PostgreSQL for live app storage requires a PostgreSQL storage integration.
