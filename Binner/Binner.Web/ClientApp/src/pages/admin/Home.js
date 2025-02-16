import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { Segment, Breadcrumb, Icon } from "semantic-ui-react";

export const Admin = () => {
  const { t } = useTranslation();
	const navigate = useNavigate();
  return (
    <div className="help">
      <Breadcrumb>
				<Breadcrumb.Section link onClick={() => navigate("/")}>{t('bc.home', "Home")}</Breadcrumb.Section>
        <Breadcrumb.Divider />
        <Breadcrumb.Section active>{t('bc.admin', "Admin")}</Breadcrumb.Section>
      </Breadcrumb>
      <h1>Admin</h1>

      <p>System administration for managing your installation.</p>

      <Segment raised>
        <h3>Choose an administration task</h3>

        <div className="helpcontainer">
          <ul>
						<li onClick={() => navigate("/admin/users")}>
              <h1>User Management</h1>
              <p>Manage the users of your system.</p>
            </li>
            <li onClick={() => navigate("/admin/backup")}>
              <h1>Backup/Restore</h1>
              <p>Backup or restore your Binner installation.</p>
            </li>
            {/*<li onClick={() => navigate("/admin/updateParts")}>
              <h1>Update Part Metadata</h1>
              <p>Refresh information from external APIs and choose which fields you would like to update.</p>
						</li>*/}
						{/*<li onClick={() => navigate("/admin/activateLicense")}>
              <h1>Activate License</h1>
              <p>If you have a paid subscription on <a href="https://binner.io" target="_blank" rel="noreferrer">Binner Cloud</a>, activate your license key to gain licensed features in your Binner installation.</p>
            </li>*/}
          </ul>
        </div>
      </Segment>
    </div>
  );
};
